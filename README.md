# CodeVault

CodeVault is a platform and browser extension for automatically archiving your accepted coding solutions from competitive programming platforms directly to your GitHub repository. This project is a customized and JavaScript-migrated implementation derived from [SolveBase](https://github.com/TushalLohar/SolveBase), preserving the secure OAuth architecture and core synchronization features.

## Overview
CodeVault connects your coding profiles to a selected GitHub repository, automatically indexing your past code and seamlessly syncing new solutions as you submit them. It bridges the gap between competitive programming platforms and a well-maintained GitHub portfolio.

## Features
- **Secure GitHub Integration**: Connects to GitHub securely using a one-time OAuth token exchange, keeping your credentials safe.
- **Automated Archiving**: Syncs accepted solutions in real-time through the browser extension.
- **Repository Indexing**: Parses existing repositories to build a comprehensive code archive index.
- **README Generation**: Automatically updates your repository's README with a summarized index of all your solved problems.
- **Legacy Repository Adoption**: Recognizes and categorizes existing solutions stored in standard platform folder structures.

## Supported Platforms
- Codeforces
- LeetCode
- CSES
- CodeChef
- GeeksforGeeks

## Architecture
CodeVault consists of two main components:
1. **Frontend / Serverless API**: A TanStack Start application hosted on Vercel that handles the initial GitHub OAuth flow and landing pages.
2. **Browser Extension**: A manifest V3 extension that runs on supported coding platforms, captures successful submissions, and uses the GitHub API directly to push code to your linked repository.

## Tech Stack
- JavaScript (ES2022)
- React 19
- TanStack Start & TanStack Router
- Tailwind CSS 4
- Vite
- Vercel (Hosting & Serverless Functions)
- Upstash Redis (Rate limiting and OAuth state management)

## Project Structure
- `api/` - Vercel serverless functions for the OAuth flow.
- `extension/` - Browser extension source files.
- `server/` - Backend utilities (OAuth configuration, rate limiting, crypto).
- `src/` - React frontend routes and components.
- `tests/` - Node.js test suite for core logic and architecture validation.

## Installation

### Environment Variables
For local development and Vercel deployment, you will need the following environment variables. Copy `.env.example` to `.env` and configure:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `TOKEN_ENCRYPTION_KEY` (Generate with `openssl rand -base64 32`)

*Note: Never prefix sensitive keys with `VITE_` or expose them in the frontend.*

### Local Development
1. Clone this repository and run `npm install`.
2. Ensure your `.env` file is properly configured.
3. Start the development server:
   ```sh
   npm run dev
   ```

### GitHub OAuth Setup
1. Register a new OAuth application in your GitHub Developer Settings.
2. Set the Authorization callback URL to match your `GITHUB_CALLBACK_URL` (e.g., `http://localhost:3000/api/oauth/github/callback`).
3. Copy the Client ID and Client Secret to your `.env` file.

### Browser Extension Setup
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the `extension/` directory of this repository.
4. Ensure the `oauth.js` and `manifest.json` files point to your local or deployed backend URL for authentication.

### Deployment
This project is optimized for deployment on Vercel. 
1. Push your code to a GitHub repository.
2. Import the project in Vercel.
3. Add an Upstash Redis integration in Vercel to obtain your `KV_REST_API_*` tokens.
4. Set all required Environment Variables in the Vercel dashboard.
5. Deploy.

## Future Improvements
- Support for LeetCode contest editors.
- Additional coding platform integrations.
- Extended analytics and visualization of problem-solving progress.
- Enhanced browser extension UI.

## License / Attribution
This project is a customized, JavaScript-based derivation of [SolveBase](https://github.com/TushalLohar/SolveBase) originally created by Tushal Lohar. The original SolveBase architecture, browser extension functionality, and secure OAuth flow have been preserved. Please refer to the original repository for primary licensing information.
