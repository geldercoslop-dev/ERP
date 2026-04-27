# Drizzle Schema Guard - Branch Protection Setup

## Overview

This document explains how to configure GitHub branch protection rules to make the Drizzle Schema Guard mandatory for all merges.

## Why This is Critical

Without branch protection rules:
- Developers can bypass CI using `git push --force`
- Pull requests can be merged without CI passing
- The Drizzle Schema Guard can be ignored

With branch protection rules:
- CI must pass before merge
- Status checks are mandatory
- Force pushes are blocked
- System is truly hardened

## Configuration Steps

### 1. Go to Repository Settings

1. Navigate to your GitHub repository
2. Click on **Settings** tab
3. Click on **Branches** in the left sidebar

### 2. Add Branch Protection Rule

1. Click **Add rule** button
2. Branch name pattern: `main`
3. Configure the following settings:

#### Required Settings

**Require status checks to pass before merging**
- ✅ ENABLE THIS

**Require branches to be up to date before merging**
- ✅ ENABLE THIS

**Do not allow bypassing the above settings**
- ✅ ENABLE THIS (critical - prevents bypass)

### 3. Add Required Status Check

1. In the "Status checks found in the last week" section, search for:
   - `Drizzle Schema Guard` (or the exact name from your CI workflow)
2. Select the check
3. Click **Save changes**

### 4. Additional Security Settings (Recommended)

**Require pull request reviews before merging**
- ✅ ENABLE THIS
- Required approving reviews: 1

**Require approval of the most recent review**
- ✅ ENABLE THIS

**Dismiss stale PR approvals when new commits are pushed**
- ✅ ENABLE THIS

**Require conversation resolution before merging**
- ✅ ENABLE THIS

**Restrict who can push to matching branches**
- ✅ ENABLE THIS
- Add only maintainers/admins

**Do not allow bypassing the above settings**
- ✅ ENABLE THIS (critical - prevents bypass)

### 5. Save the Rule

Click **Create** or **Save changes** to apply the rule.

## Verification

To verify the configuration is working:

1. Create a test branch
2. Make a change that would violate the Drizzle Schema Guard
3. Create a pull request
4. Try to merge the PR

**Expected Result:**
- Merge button should be disabled
- Error message: "Required status check 'Drizzle Schema Guard' is expected"
- System blocks the merge

## CI Workflow Status Check Name

The status check name from your CI workflow (`.github/workflows/ci.yml`) is:

```
Drizzle Schema Guard
```

This is the name of the step:
```yaml
- name: Drizzle Schema Guard
  run: node scripts/drizzle-schema-guard.mjs
```

## What This Prevents

### Before Branch Protection
- ❌ Developers can push without CI
- ❌ PRs can be merged with failing CI
- ❌ Force pushes can bypass all checks
- ❌ Drizzle Schema Guard can be ignored

### After Branch Protection
- ✅ CI must pass before merge
- ✅ PRs blocked if Drizzle Guard fails
- ✅ Force pushes blocked
- ✅ Drizzle Schema Guard is mandatory
- ✅ System is truly irreversible

## Troubleshooting

### Status Check Not Showing

If the "Drizzle Schema Guard" status check doesn't appear:

1. Run the CI workflow at least once on the main branch
2. Wait for GitHub to index the status check
3. Refresh the branch protection settings page

### Merge Button Still Enabled

If the merge button is still enabled despite failing CI:

1. Check if "Do not allow bypassing" is enabled
2. Verify the status check name matches exactly
3. Check if you have admin permissions that bypass rules

## Automation Note

Branch protection rules cannot be configured via:
- Git commands
- CI/CD workflows
- GitHub API (without proper permissions)

They must be configured manually in the GitHub UI by a repository administrator.

## Summary

Once configured, the system is fully hardened:

- ✅ Pre-commit blocks local commits
- ✅ Pre-push blocks local pushes
- ✅ CI blocks remote merges
- ✅ Branch protection enforces CI requirement
- ✅ Drizzle Schema Guard is mandatory at all levels

The system is now truly irreversible.
