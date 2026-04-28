# Failure Library

Pre-task retrieval source. The orchestrator queries this file
before spawning any agent on a file or domain.

Add entries using this format after running into a failure:

FILE:       [exact file path where failure occurred]
SYMPTOM:    [what the operator or user observed]
ROOT CAUSE: [confirmed cause, not hypothesis]
PATTERN:    [the rule to remember when working in this area]
DATE:       [YYYY-MM-DD]
AGENT:      [agent role that surfaced the pattern]
