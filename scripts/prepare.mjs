import { execSync } from 'node:child_process'
import { env } from 'node:process'

// Skip skills installation in deployment environments (Docker, CI).
// Set SKILLS_INSTALL=false to disable; runs skills-npm normally otherwise.
if (env.SKILLS_INSTALL === 'false') {
  console.log('[prepare] SKILLS_INSTALL=false, skipping skills-npm')
}
else {
  execSync('skills-npm', { stdio: 'inherit' })
}
