# Security

Please report a security problem privately: use **Report a vulnerability** under the repository's Security tab on
GitHub. Do not open a public issue for it.

Include what you did, what happened, the version (shown on the About screen and in the page footer), and whether you
were using the desktop app, the Docker image or the appliance. You will get a reply as soon as it has been read.

What to know about how the app is built:

- The web app is meant for your own network. The first account created becomes the owner; passwords are hashed, and
  passkeys and authenticator codes are supported. Sign-in attempts are rate limited.
- Uploaded archives are checked before unpacking (paths, size and entry counts), and worlds are only read from and
  written to the worlds folder the server was started with.
- Extensions run as separate programs with an empty environment, a time limit, a size limit and only the permissions
  you allowed.
- Installers are not code signed. Verify downloads with the `SHA256SUMS` file attached to each release.
