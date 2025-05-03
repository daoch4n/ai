import { Router } from 'itty-router';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

// Create a new router
const router = Router();

// Verify GitHub webhook signature
async function verifyWebhookSignature(request, secret) {
  const signature = request.headers.get('x-hub-signature-256');
  if (!signature) return false;

  const body = await request.clone().text();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body)
  );

  const hexSignature = Array.from(new Uint8Array(signed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signature === `sha256=${hexSignature}`;
}

// Get an authenticated Octokit instance for an installation
async function getOctokit(appId, privateKey, installationId) {
  const auth = createAppAuth({
    appId,
    privateKey,
    installationId
  });

  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

// Process an issue with Aider
async function processIssue(owner, repo, issueNumber, installationId, env) {
  console.log(`Starting to process issue #${issueNumber} in ${owner}/${repo}`);
  console.log(`Using App ID: ${env.APP_ID} and Installation ID: ${installationId}`);

  try {
    const octokit = await getOctokit(env.APP_ID, env.PRIVATE_KEY, installationId);
    console.log('Successfully authenticated with GitHub API');

    // Get issue details
    const { data: issue } = await octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    });

    // Add ai-processing label
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: ['ai-processing']
    });

    // Get default branch
    const { data: repository } = await octokit.repos.get({
      owner,
      repo
    });
    const defaultBranch = repository.default_branch;

    // Get latest commit on default branch
    const { data: commits } = await octokit.repos.listCommits({
      owner,
      repo,
      sha: defaultBranch,
      per_page: 1
    });
    const latestCommitSha = commits[0].sha;

    // Create a new branch
    const branchName = `ai-fix/issue-${issueNumber}`;
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: latestCommitSha
    });

    // Since we can't run Aider directly in a Cloudflare Worker, we'll use a different approach
    // We'll create a workflow dispatch event to trigger a GitHub Action that runs Aider

    // First, check if the repository has the aider-process-issue.yml workflow
    let hasWorkflow = false;
    try {
      const { data: workflows } = await octokit.actions.listRepoWorkflows({
        owner,
        repo
      });

      hasWorkflow = workflows.workflows.some(workflow =>
        workflow.name === '🤖 AI Process Issue' ||
        workflow.path.includes('aider-process-issue.yml')
      );
    } catch (error) {
      console.error('Error checking for workflow:', error);
    }

    if (hasWorkflow) {
      // Trigger the workflow
      await octokit.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: 'aider-process-issue.yml',
        ref: defaultBranch,
        inputs: {
          issue_number: String(issueNumber),
          branch_name: branchName
        }
      });

      // Add a comment to the issue
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: `I've started processing this issue. A pull request will be created shortly.`
      });

      return;
    }

    // If the repository doesn't have the workflow, we'll create a simple PR with instructions
    const fileContent = `# AI Fix for Issue #${issueNumber}

This branch was created to address issue #${issueNumber}: ${issue.title}

## Original Issue
${issue.body}

## Next Steps
To complete this fix, you'll need to:

1. Clone this branch: \`git clone -b ${branchName} https://github.com/${owner}/${repo}.git\`
2. Make the necessary changes to address the issue
3. Push your changes back to this branch
4. The pull request will be updated automatically

Alternatively, you can set up the \`aider-process-issue.yml\` workflow in your repository to automate this process.`;

    // Create a README.md file in the branch
    const { data: readmeContent } = await octokit.repos.getContent({
      owner,
      repo,
      path: 'README.md',
      ref: defaultBranch
    }).catch(() => ({ data: null }));

    const readmeBlob = await octokit.git.createBlob({
      owner,
      repo,
      content: Buffer.from(fileContent).toString('base64'),
      encoding: 'base64'
    });

    // Create a tree with the new file
    const { data: tree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: latestCommitSha,
      tree: [
        {
          path: 'AI_FIX.md',
          mode: '100644',
          type: 'blob',
          sha: readmeBlob.sha
        }
      ]
    });

    // Create a commit
    const { data: commit } = await octokit.git.createCommit({
      owner,
      repo,
      message: `🤖 Initial setup for fixing issue #${issueNumber}`,
      tree: tree.sha,
      parents: [latestCommitSha]
    });

    // Update the branch reference
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
      sha: commit.sha
    });

    // Create a pull request
    const { data: pullRequest } = await octokit.pulls.create({
      owner,
      repo,
      title: `🤖 Fix #${issueNumber}: ${issue.title}`,
      body: `This PR was automatically generated to address issue #${issueNumber}

## Original Issue
${issue.body}

## Next Steps
This is a placeholder PR. To complete the fix:

1. Clone this branch
2. Make the necessary changes
3. Push your changes back to this branch

Alternatively, set up the \`aider-process-issue.yml\` workflow in your repository to automate this process with AI.

Closes #${issueNumber}`,
      head: branchName,
      base: defaultBranch
    });

    // Add labels to the PR
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: pullRequest.number,
      labels: ['ai-generated']
    });

    // Add a comment to the issue
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: `I've created a pull request to address this issue: ${pullRequest.html_url}

Since I couldn't find the \`aider-process-issue.yml\` workflow in your repository, I've created a placeholder PR. You'll need to manually implement the changes to fix the issue.`
    });

    // Remove ai-processing label and add ai-processed
    await octokit.issues.removeLabel({
      owner,
      repo,
      issue_number: issueNumber,
      name: 'ai-processing'
    }).catch(() => {});

    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: ['ai-processed']
    });

  } catch (error) {
    console.error('Error processing issue:', error);

    try {
      // Add a comment about the error
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: `An error occurred while processing this issue: ${error.message}`
      });

      // Remove ai-processing label
      await octokit.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: 'ai-processing'
      }).catch(() => {});
    } catch (commentError) {
      console.error('Error adding comment:', commentError);
    }
  } catch (error) {
    console.error(`Fatal error processing issue #${issueNumber}:`, error);
  }

  console.log(`Finished processing issue #${issueNumber}`);
}

// Handle webhook events
router.post('/webhook', async (request, env) => {
  console.log('Received webhook event');

  // Verify the webhook signature
  const isValid = await verifyWebhookSignature(request, env.WEBHOOK_SECRET);
  if (!isValid) {
    console.error('Invalid webhook signature');
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('Webhook signature verified successfully');

  // Parse the request body
  const body = await request.json();
  const event = request.headers.get('x-github-event');

  console.log(`Received ${event} event with action: ${body.action}`);

  // Process issues.labeled events
  if (event === 'issues' && body.action === 'labeled') {
    const label = body.label.name;
    console.log(`Label added: ${label}`);

    if (label === 'aider-pro') {
      const owner = body.repository.owner.login;
      const repo = body.repository.name;
      const issueNumber = body.issue.number;
      const installationId = body.installation.id;

      console.log(`Processing issue #${issueNumber} in ${owner}/${repo} with installation ID ${installationId}`);

      // Process the issue asynchronously
      // In Cloudflare Workers, we can't use async processing outside of the request handler
      // So we'll return a response immediately and do the processing within the request handler
      processIssue(owner, repo, issueNumber, installationId, env)
        .catch(error => console.error(`Error processing issue #${issueNumber}:`, error));

      return new Response(JSON.stringify({
        message: 'Processing issue',
        issue: issueNumber,
        repository: `${owner}/${repo}`
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      console.log(`Ignoring label ${label} (not aider-pro)`);
    }
  } else {
    console.log(`Ignoring event ${event} with action ${body.action} (not issues.labeled)`);
  }

  return new Response(JSON.stringify({
    message: 'Event received',
    event: event,
    action: body.action || 'none'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});

// Handle GET requests to the root
router.get('/', () => {
  return new Response('AiderFixer GitHub App is running!', {
    headers: { 'Content-Type': 'text/plain' }
  });
});

// Handle all other routes
router.all('*', () => new Response('Not Found', { status: 404 }));

// Event handler for all requests
export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
};
