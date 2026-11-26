# Map Editor API in Postman

`map-editor.postman_collection.json` is the master collection: every HTTP route the server answers, grouped by area
(sign-in and accounts, worlds, editing and views, history and activity, extensions, tools).

1. Import the file into Postman.
2. Set the `baseUrl` variable to your server, for example `http://localhost:8420`.
3. Send `POST /api/auth/login` first; Postman keeps the session cookie for the other requests.

The collection is written from the server's own route list by `node scripts/postman.mjs`, and a test fails when
the two differ, so it cannot fall behind the code. Each state-changing request carries the fields the server reads, also
taken from the server's code, with an example value for each. Values in angle brackets, such as an id or a ticket,
come from an earlier request. Uploads (a world archive, an extension, a structure file) take the file itself as the
body together with the `X-Map-Editor: 1` header.
