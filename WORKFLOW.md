# Development Workflow Guide

## Overview

This document outlines the code review workflow and contribution process for the TitanBot repository.

## Branch Protection

The `main` branch is protected to ensure code quality and stability. All changes must go through the pull request process with proper review and approval.

### Current Protection Status

- **Main Branch**: Protected ✅
- **Required Reviews**: Enforced through CODEOWNERS
- **Code Owner**: @codebymitch

## CODEOWNERS File

The `.github/CODEOWNERS` file defines code ownership for the repository. This file ensures that:

- All files (`*`) require review and approval from @codebymitch
- Pull requests cannot be merged without the owner's approval
- The code owner is automatically requested as a reviewer on all PRs

### How CODEOWNERS Works

When you open a pull request:
1. GitHub automatically assigns @codebymitch as a required reviewer
2. The PR cannot be merged until the owner approves
3. This ensures all code changes are reviewed before integration

## Contributing Workflow

### 1. Create a Feature Branch

Always create a new branch for your work. Never commit directly to `main`:

```bash
# Update your local main branch
git checkout main
git pull origin main

# Create a new feature branch
git checkout -b feature/your-feature-name
```

**Branch Naming Conventions:**
- `feature/` - New features (e.g., `feature/add-music-commands`)
- `fix/` - Bug fixes (e.g., `fix/leveling-system-crash`)
- `docs/` - Documentation updates (e.g., `docs/update-setup-guide`)
- `refactor/` - Code refactoring (e.g., `refactor/database-connection`)
- `test/` - Test additions or updates (e.g., `test/add-command-tests`)

### 2. Make Your Changes

1. Write clean, well-documented code
2. Follow existing code style and conventions
3. Test your changes thoroughly
4. Ensure the bot runs without errors

```bash
# Install dependencies if needed
npm install

# Test your changes
npm start
```

### 3. Commit Your Changes

Write clear, descriptive commit messages:

```bash
# Stage your changes
git add .

# Commit with a meaningful message
git commit -m "Add music playback commands with queue system"
```

**Commit Message Guidelines:**
- Use present tense ("Add feature" not "Added feature")
- Be specific and descriptive
- Reference issue numbers if applicable (e.g., "Fix #123: Resolve leveling bug")

### 4. Push Your Branch

```bash
# Push your branch to GitHub
git push origin feature/your-feature-name
```

### 5. Create a Pull Request

1. Go to the [TitanBot repository](https://github.com/codebymitch/TitanBot)
2. Click "Pull requests" → "New pull request"
3. Select your branch as the source
4. Fill in the PR template with:
   - **Title**: Clear, concise description of changes
   - **Description**: Detailed explanation of what and why
   - **Testing**: How you tested the changes
   - **Screenshots**: If applicable (UI changes, new commands)

**PR Description Template:**
```markdown
## Description
Brief description of what this PR does

## Changes Made
- List of specific changes
- Another change
- etc.

## Testing
How this was tested

## Screenshots (if applicable)
Add screenshots here
```

### 6. Code Review Process

1. **Automatic Review Request**: @codebymitch is automatically added as a reviewer
2. **Review Phase**: The code owner reviews your changes
3. **Feedback**: Address any requested changes
4. **Approval**: Once approved, the PR can be merged
5. **Merge**: The code owner or maintainer merges the PR

### 7. After Merge

Once your PR is merged:
1. Delete your feature branch (GitHub offers this option)
2. Update your local repository:
   ```bash
   git checkout main
   git pull origin main
   ```
3. Your changes are now in the main branch! 🎉

## Code Review Guidelines

### For Contributors

- Respond promptly to review feedback
- Be open to suggestions and improvements
- Ask questions if feedback is unclear
- Make requested changes in new commits (don't force push during review)

### What Reviewers Look For

- Code quality and readability
- Proper error handling
- Testing coverage
- Documentation updates
- Performance considerations
- Security best practices
- Compatibility with existing features

## Best Practices

### Do's ✅

- Keep PRs focused and reasonably sized
- Write descriptive commit messages
- Test thoroughly before submitting
- Update documentation for new features
- Follow existing code patterns
- Ask questions if unsure

### Don'ts ❌

- Don't commit directly to `main`
- Don't submit large, unfocused PRs
- Don't ignore reviewer feedback
- Don't commit sensitive data (tokens, passwords)
- Don't break existing functionality
- Don't skip testing

## Getting Help

If you need help or have questions:

1. Check existing documentation (README.md, SECURITY.md)
2. Review closed PRs for examples
3. Open an issue for discussion
4. Join the support server (link in README)
5. Tag @codebymitch in your PR comments

## Development Environment

### Prerequisites

- Node.js 18.0.0 or higher
- PostgreSQL (recommended) or memory storage
- Discord bot token and proper permissions

### Setup

See the [README.md](README.md) for detailed setup instructions.

### Testing

```bash
# Start the bot
npm start

# Run database tests (if PostgreSQL configured)
npm run test-postgres
```

## Security

- Never commit `.env` files or secrets
- Report security issues privately to @codebymitch
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

## Questions?

Feel free to open an issue or reach out to @codebymitch if you have any questions about the development workflow.

---

*Thank you for contributing to TitanBot! Your contributions help make this bot better for everyone.* ❤️
