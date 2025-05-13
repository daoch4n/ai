# 🪄 AiderFixer GitHub App ✨ 
# 🚧 It just comments for now 🚧

🚧 A Cloudflare Worker that implements a GitHub App to automatically generate pull requests from issues labeled with "aider-pro". 🚧

## Features 🚧

- Listens for the "aider-pro" label being added to issues ✅
- Creates a new branch for the issue 🚧
- Triggers the `aider-process-issue.yml` workflow if it exists in the repository 🚧
- Adds appropriate labels and comments to track progress ✅

# 🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧🚧

## Setup

### 1. Register a GitHub App

1. Go to GitHub > Settings > Developer settings > GitHub Apps > New GitHub App
2. Configure the app:
   - Name: "AiderFixer"
   - Homepage URL: Your repository URL
   - Webhook URL: The URL of your deployed Cloudflare Worker
   - Webhook secret: Generate a secure random string
   - Permissions:
     - Repository permissions:
       - Contents: Read & write (to create branches and commits)
       - Issues: Read & write (to read issues and add comments)
       - Pull requests: Read & write (to create PRs)
       - Workflows: Read & write (to trigger workflows)
     - Organization permissions:
       - None needed for basic functionality
     - Account permissions:
       - None needed for basic functionality
   - Subscribe to events:
     - Issues (to detect when labels are added)
3. Create the app and note down:
   - App ID
   - Private key (download the .pem file)
   - Webhook secret

### 2. Deploy the Cloudflare Worker

#### Option 1: Deploy with GitHub Actions (Recommended)

1. Add the following secrets to your GitHub repository:
   - `CF_API_TOKEN`: Your Cloudflare API token with Worker Scripts Edit permission
   - `CF_ACCOUNT_ID`: Your Cloudflare account ID
   - `APP_ID`: Your GitHub App ID
   - `WEBHOOK_SECRET`: Your GitHub App webhook secret
   - `PRIVATE_KEY`: Your GitHub App private key (the entire PEM file content)
   - `GEMINI_API_KEY`: Your Google API key for Gemini

2. Update the `wrangler.toml` file with your GitHub App ID and webhook secret:
   ```toml
   [vars]
   APP_ID = "your-github-app-id"
   WEBHOOK_SECRET = "your-webhook-secret"
   ```

3. Push your changes to the main branch, and the GitHub Actions workflow will automatically deploy the worker.

#### Option 2: Deploy Manually

1. Install Wrangler CLI:
   ```
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```
   wrangler login
   ```

3. Update the `wrangler.toml` file with your GitHub App ID:
   ```toml
   [vars]
   APP_ID = "your-github-app-id"
   WEBHOOK_SECRET = "your-webhook-secret"
   ```

4. Add your GitHub App private key and Gemini API key as secrets:
   ```
   wrangler secret put PRIVATE_KEY
   wrangler secret put GEMINI_API_KEY
   ```

5. Deploy the worker:
   ```
   npm run deploy
   ```

### 3. Install the GitHub App

1. Install the GitHub App on your repository
2. Create the necessary labels in your repository:
   - `aider-pro`: To trigger the workflow
   - `ai-processing`: Added automatically during processing
   - `ai-processed`: Added automatically after processing
   - `ai-generated`: Added to pull requests

## Usage

1. Create an issue in your repository
2. Add the "aider-pro" label to the issue
3. The GitHub App will:
   - Add the "ai-processing" label to the issue
   - Create a new branch
   - Either trigger the `aider-process-issue.yml` workflow or create a placeholder PR
   - Add a comment to the issue with a link to the PR
   - Add the "ai-processed" label to the issue

## Development

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```

3. Run the worker locally:
   ```
   npm run dev
   ```

4. Make changes to the code
5. Deploy the worker:
   ```
   npm run deploy
   ```
