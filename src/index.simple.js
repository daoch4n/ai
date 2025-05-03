/**
 * AiderFixer GitHub App - Simplified Version
 * 
 * This Cloudflare Worker handles GitHub webhook events.
 * When an issue is labeled with "aider-pro", it adds a comment to the issue.
 * This version uses a PAT token directly instead of GitHub App authentication.
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
              <p>Environment variables:</p>
              <ul>
                <li>APP_ID: ${env.APP_ID ? "✅ Set" : "❌ Not set"}</li>
                <li>WEBHOOK_SECRET: ${env.WEBHOOK_SECRET ? "✅ Set" : "❌ Not set"}</li>
                <li>PRIVATE_KEY: ${env.PRIVATE_KEY ? "✅ Set" : "❌ Not set"}</li>
                <li>PAT_PAT: ${env.PAT_PAT ? "✅ Set" : "❌ Not set"}</li>
              </ul>
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
      // Skip signature verification for simplicity
      
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
          
          // Use the PAT token directly
          const token = env.PAT_PAT;
          
          if (!token) {
            throw new Error("PAT_PAT environment variable is not set");
          }
          
          // Create a controller for the fetch request
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
          
          try {
            // Add a comment to the issue
            const commentResponse = await fetch(
              `${GITHUB_API}/repos/${payload.repository.owner.login}/${payload.repository.name}/issues/${payload.issue.number}/comments`,
              {
                method: "POST",
                headers: {
                  "Authorization": `token ${token}`,
                  "Accept": "application/vnd.github.v3+json",
                  "Content-Type": "application/json",
                  "User-Agent": "AiderFixer-GitHub-App"
                },
                body: JSON.stringify({
                  body: `🤖 **AiderFixer GitHub App**\n\nI'm processing this issue labeled with "aider-pro". I'll create a pull request with changes to address this issue soon.\n\nTimestamp: ${new Date().toISOString()}`
                }),
                signal: controller.signal
              }
            );
            
            clearTimeout(timeoutId);
            
            if (!commentResponse.ok) {
              const errorText = await commentResponse.text();
              throw new Error(`Failed to add comment: ${commentResponse.status} ${commentResponse.statusText}\n${errorText}`);
            }
            
            const commentData = await commentResponse.json();
            console.log(`Added comment to issue #${payload.issue.number}: ${commentData.html_url}`);
            
            // Add "ai-processing" label
            const labelResponse = await fetch(
              `${GITHUB_API}/repos/${payload.repository.owner.login}/${payload.repository.name}/issues/${payload.issue.number}/labels`,
              {
                method: "POST",
                headers: {
                  "Authorization": `token ${token}`,
                  "Accept": "application/vnd.github.v3+json",
                  "Content-Type": "application/json",
                  "User-Agent": "AiderFixer-GitHub-App"
                },
                body: JSON.stringify({
                  labels: ["ai-processing"]
                })
              }
            );
            
            if (!labelResponse.ok) {
              const errorText = await labelResponse.text();
              console.error(`Failed to add label: ${labelResponse.status} ${labelResponse.statusText}\n${errorText}`);
            } else {
              console.log(`Added "ai-processing" label to issue #${payload.issue.number}`);
            }
          } catch (apiError) {
            console.error(`Error making GitHub API calls:`, apiError);
            clearTimeout(timeoutId);
          }
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
