Codex instructions — GeekSuite migration task

Use this verbatim.

You are a coding agent working inside the GeekSuite monorepo.

Your job is to migrate apps from runtime Docker builds to the prebuilt image architecture.

You are allowed to read and modify files in the repository.

You must start making changes immediately. Do not ask for permission unless the task is ambiguous.

Mission

Migrate ONE app at a time to the new Docker architecture.

We already successfully migrated BaseGeek and BabelGeek.

Your next target app and final port to use will be specified in the instructions.

Definition of Done

An app is considered migrated when ALL of the following are true:

apps/<app>/Dockerfile exists using the standard template

Backend serves built frontend from /public

Image builds successfully from monorepo root

Runtime docker-compose uses image: instead of build:

Runtime folder no longer requires source code

You will implement steps 1–2 in this repository.

Do NOT modify server runtime folders.

Allowed directories

You may edit freely inside:

apps/<app>/**
packages/**


Do NOT modify:

/mnt/Media/Docker/*
CI
infra
unrelated apps

Standard app structure
When migrating an app, normalize it to the standard structure.

Each app must end in this shape:

apps/<app>/
  backend/
  frontend/
  Dockerfile


Backend must serve the frontend build output.

Standard Dockerfile template

Create apps/<app>/Dockerfile using the same pattern as BabelGeek.

(Then paste your Dockerfile template)

Required backend change

Ensure Express serves static files:

(paste express snippet)

Execution plan

Follow this EXACT sequence:

Locate the app in the monorepo

Inspect its backend and frontend structure

You now officially have two app types:

App type	Base image	Start command
Node apps	node:20	npm start
Bun apps	oven/bun	bun run start

Create the Dockerfile

Modify backend to serve static frontend if missing

After making changes, attempt to build the Docker image and fix any errors. Repeat until build succeeds. 

Summarize the changes you made

At the end give the user instructions on what runtime files need updating and how to update them.

Do NOT migrate any other apps yet.

Begin now.