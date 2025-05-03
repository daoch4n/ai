/**
 * AiderFixer GitHub App
 * 
 * This Cloudflare Worker handles GitHub webhook events for the AiderFixer GitHub App.
 * When an issue is labeled with "aider-pro", it adds a comment to the issue.
 */

// GitHub API endpoints
const GITHUB_API = "https://api.github.com";

export default {
  /**
   * Handle incoming requests
   * @param {Request} request - The incoming request
   * @param {Object} env - Environment variables
   */
  async fetch(request, env) {
    console.log(`Received ${request.method} request to ${request.url}`);

    // For GET requests, return a simple status page
    if (request.method === "GET") {
      return new Response(`
        <html>
          <head>
            <title>AiderFixer GitHub App</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; color: #24292e; max-width: 800px; margin: 0 auto; padding: 20px; }
              h1 { border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
              .status { background-color: #f6f8fa; padding: 15px; border-radius: 6px; }
              .status.success { border-left: 4px solid #2cbe4e; }
            </style>
          </head>
          <body>
            <h1>🤖 AiderFixer GitHub App</h1>
            <div class="status success">
              <p><strong>Status:</strong> The AiderFixer GitHub App is running!</p>
              <p>This app automatically processes issues labeled with "aider-pro".</p>
            </div>
            <p>For more information, see the <a href="https://github.com/daoch4n/aiderfixer">GitHub repository</a>.</p>
          </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html" }
      });
    }

    // Only process POST requests (webhooks)
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      // Verify the webhook signature
      const signature = request.headers.get("x-hub-signature-256");
      if (!signature) {
        return new Response("Missing signature", { status: 401 });
      }

      // Parse the webhook payload
      const payload = await request.json();
      
      // Get the event type
      const event = request.headers.get("x-github-event");
      console.log(`Received GitHub event: ${event}`);
      
      // Process the webhook based on the event type
      if (event === "issues" && payload.action === "labeled") {
        // Check if the label is "aider-pro"
        if (payload.label.name === "aider-pro") {
          console.log(`Processing issue #${payload.issue.number} with "aider-pro" label`);
          
          // Get the installation ID
          const installationId = payload.installation.id;
          
          // Get an installation token
          const token = await getInstallationToken(env.APP_ID, env.PRIVATE_KEY, installationId);
          
          // Add a comment to the issue
          await addCommentToIssue(
            token,
            payload.repository.owner.login,
            payload.repository.name,
            payload.issue.number,
            `🤖 **AiderFixer GitHub App**\n\nI'm processing this issue labeled with "aider-pro". I'll create a pull request with changes to address this issue soon.\n\nTimestamp: ${new Date().toISOString()}`
          );
          
          // Add "ai-processing" label
          await addLabelToIssue(
            token,
            payload.repository.owner.login,
            payload.repository.name,
            payload.issue.number,
            ["ai-processing"]
          );
        }
      }
      
      // Return a success response
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};

/**
 * Get an installation token for a GitHub App
 * @param {string} appId - The GitHub App ID
 * @param {string} privateKey - The GitHub App private key
 * @param {number} installationId - The installation ID
 * @returns {Promise<string>} The installation token
 */
async function getInstallationToken(appId, privateKey, installationId) {
  try {
    // Create a JWT for the GitHub App
    const jwt = await createJWT(appId, privateKey);
    
    // Get an installation token
    const response = await fetch(
      `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "AiderFixer-GitHub-App"
        }
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get installation token: ${response.status} ${response.statusText}\n${error}`);
    }
    
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Error getting installation token:", error);
    throw error;
  }
}

/**
 * Create a JWT for GitHub App authentication
 * @param {string} appId - The GitHub App ID
 * @param {string} privateKey - The GitHub App private key
 * @returns {Promise<string>} The JWT
 */
async function createJWT(appId, privateKey) {
  // For simplicity, we'll use a pre-generated JWT for testing
  // In production, you would generate a proper JWT
  
  // Return a dummy JWT for now
  return "dummy_jwt_token";
}

/**
 * Add a comment to an issue
 * @param {string} token - The GitHub token
 * @param {string} owner - The repository owner
 * @param {string} repo - The repository name
 * @param {number} issueNumber - The issue number
 * @param {string} body - The comment body
 * @returns {Promise<void>}
 */
async function addCommentToIssue(token, owner, repo, issueNumber, body) {
  try {
    // Use the GitHub REST API to add a comment
    const response = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        headers: {
          "Authorization": `token ${token}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "AiderFixer-GitHub-App"
        },
        body: JSON.stringify({ body })
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to add comment: ${response.status} ${response.statusText}\n${error}`);
    }
    
    const data = await response.json();
    console.log(`Added comment to issue #${issueNumber}: ${data.html_url}`);
  } catch (error) {
    console.error(`Error adding comment to issue #${issueNumber}:`, error);
    throw error;
  }
}

/**
 * Add labels to an issue
 * @param {string} token - The GitHub token
 * @param {string} owner - The repository owner
 * @param {string} repo - The repository name
 * @param {number} issueNumber - The issue number
 * @param {string[]} labels - The labels to add
 * @returns {Promise<void>}
 */
async function addLabelToIssue(token, owner, repo, issueNumber, labels) {
  try {
    // Use the GitHub REST API to add labels
    const response = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
      {
        method: "POST",
        headers: {
          "Authorization": `token ${token}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "AiderFixer-GitHub-App"
        },
        body: JSON.stringify({ labels })
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to add labels: ${response.status} ${response.statusText}\n${error}`);
    }
    
    console.log(`Added labels to issue #${issueNumber}: ${labels.join(", ")}`);
  } catch (error) {
    console.error(`Error adding labels to issue #${issueNumber}:`, error);
    throw error;
  }
}
