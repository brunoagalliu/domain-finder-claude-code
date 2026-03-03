# Domain Search

Interactive domain name brainstorming tool for Claude Code.

## How It Works
1. User describes their business/project
2. Claude generates brandable domain ideas
3. `check-domains.mjs` checks .com availability via Namecheap API
4. Results saved to file for reference

## Usage
```bash
# Set env vars
export NAMECHEAP_API_USER="username"
export NAMECHEAP_API_KEY="your_key"
export NAMECHEAP_USERNAME="username"
export NAMECHEAP_CLIENT_IP="your_ip"

# Check domains (results saved to file)
node check-domains.mjs domain1 domain2 domain3
```

## Workflow
- Ask Claude for domain ideas based on concept/theme
- Claude checks availability in batches
- Available domains saved to `results/` folder
- Iterate with new themes until finding the right name

## Files
- `check-domains.mjs` - Namecheap API domain checker
- `.env.local` - API credentials (gitignored)
- `results/` - Saved search results
