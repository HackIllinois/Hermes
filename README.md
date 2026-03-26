# Hermes

## Running Hermes

### Local development
1. Install dependencies with `yarn`
2. Start the API with `yarn dev`

### Local production-style run
1. Build the server with `yarn build`
2. Start the compiled server with `yarn start`

### EC2 / CodeDeploy
1. GitHub Actions builds `dist/`
2. CodeDeploy ships the built artifact to `/home/ubuntu/hermes`
3. The EC2 host installs production dependencies with Yarn
4. PM2 runs `node dist/index.js`
5. Nginx proxies public traffic to Hermes on `127.0.0.1:5555`

Hermes includes an `appspec.yml`, `ecosystem.config.cjs`, and deployment scripts under `scripts/` so CodeDeploy can deploy a CI-built artifact onto an EC2 instance without compiling TypeScript on the box.

## Authentication
1. Start the server with `yarn dev`
2. visit http://localhost:5555/api/auth/login in your browser
3. Log in with your HackIllinois email
4. You will receive an `access_token`. use the header `Authorization: <access_token_here>` for all requests.

### Contact
- Email [akul.sharma@hackillinois.org](mailto:akul.sharma@hackillinois.org) with questions. API docs are entirely AI generated so they may be a bit inaccurate LOL
