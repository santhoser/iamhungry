# Cafe77 project instructions

Read `memory.md` before inspecting or changing this project. It contains the agreed product scope, architecture, commands, implementation status and limitations. Read relevant source files for the task; memory is a guide, not a substitute for verification.

Whenever application behaviour, configuration, schema, dependencies, setup or tests change, update `memory.md` in the same work session. Preserve user decisions, record verification actually performed, and explicitly record unfinished work. This applies to all future sessions in this project.

Develop and test locally first. Do not provision or deploy Cloudflare resources unless the user authorizes that step. Target free hosting only. Phase 1 is one restaurant, counter payments only, no messaging. Do not enable online UPI without a real server-verified integration.

Keep amounts in integer paise; enforce permissions and order transitions on the server. Never put credentials, session tokens, customer records or live database contents in memory.md. No default production passwords.
