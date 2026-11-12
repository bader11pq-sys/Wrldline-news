# WRLDLINE editorial access

The editorial dashboard at `/admin.html` requires a trusted Supabase Auth app-metadata role.

## Grant the first editor

1. Open Supabase Dashboard → Authentication → Users.
2. Select the account that should manage WRLDLINE editorial content.
3. In **Raw App Metadata**, set or merge this JSON value:

   ```json
   { "role": "admin" }
   ```

4. Save, then sign out and sign in again so the access token contains the updated app metadata.

Use `"role": "editor"` for a regular editor. Only `editor` and `admin` are accepted by the dashboard and database policies.

Do not place roles in User Metadata: users can edit their own user metadata, so it is not trusted for authorization.

## Editorial workflow

- `draft`: hidden from the public news feed.
- `review`: hidden from the public news feed until approved.
- `published`: visible to readers.
- `rejected`: hidden from the public news feed.

The verification field remains separate from publication status: confirmed, multi-source, preliminary, or unconfirmed.

## Automation compatibility

The RSS and translation workflows continue to use the publishable key for public reads and inserts only. Anonymous UPDATE and DELETE access to articles and translations is removed. Editorial mutations require a trusted app-metadata role.
