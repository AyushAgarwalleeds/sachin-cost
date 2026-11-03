# One-time shared history setup

The website runs as static files on Vercel or Netlify. Supabase supplies the managed database, sign-in and change notifications. There is no application server to maintain. Automatic cross-device history starts only after a real Supabase project is configured and factory users sign in.

## 1. Create the factory database

Create a Supabase project for Cost by Ayush. Open its SQL editor and run the complete contents of `database/supabase.sql` once. It creates the member list, costing/quotation records, team notes, access policies and realtime publication.

Use a separate project for this factory. All active members of this project can see the factory history; it is not a multi-company service.

## 2. Add factory users

In Supabase Authentication, create or invite each factory user. Use individual accounts. Public self-sign-up is unnecessary; the member allowlist protects the database even if sign-up remains enabled.

For every account, run the following in the SQL editor, changing the email and display name:

```sql
insert into public.cutcost_members (user_id, display_name)
select id, 'Ayush' from auth.users where email = 'YOUR-EMAIL'
on conflict (user_id) do update
set active = true, display_name = excluded.display_name;
```

The user must already exist in Authentication. Accounts absent from this table cannot read or write factory history. To revoke factory access, set that member's `active` field to `false`.

## 3. Connect Vercel / Netlify

In the hosting project's environment variables, set:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Find these values in the Supabase project's API connection settings. Use the public publishable key (`sb_publishable_…`) or legacy `anon` key. Never use a secret or `service_role` key. The app rejects such keys in its connection form.

Redeploy the website after changing Vite environment variables. These values are project identifiers, not the user's password or an administrative credential. Row-level security and authenticated factory membership protect the data.

For local testing, copy `.env.example` to `.env.local`, enter the two public values, and restart `npm run dev`. Alternatively enter them in **Communication centre → Connection settings**; this saves the public connection identity on that browser only.

## 4. Sign in on each device

Open **Communication centre** and sign in using an account that was added as a factory member. The banner changes to **Factory history is connected** only after authentication, membership verification and a database read succeed.

The calculator automatically saves a costing snapshot after two seconds when its drawing units and included jobs are reviewed and inputs are valid. Creating a quotation saves an immutable measurement/pricing snapshot. Re-exporting the identical quote reuses its record. Changing an existing quote creates a numbered revision (`-R2`, `-R3`, etc.).

Costings and quotations synchronize to other signed-in members. Realtime updates and a 30-second refresh keep the centre current. It loads the latest 300 cloud records and caches up to 500 locally. The database retains older records, but the current screen does not browse older pages yet.

Original CAD files and editable CAD geometry remain on the device. Shared records contain job measurements, prices, quantities, quotation options, customer details and the company/rate snapshot needed to recreate the exact quote. Internal rates are therefore visible to factory members. Customer sharing exports only the selected PDF content.

When offline, records remain queued locally. Synchronization retries after reconnection, sign-in and refresh. Pending local changes take precedence over stale history fetched from the server. Another member's measurements and prices cannot be overwritten through the app; shared status changes use a separate checked database function.

## 5. WhatsApp and email

- **Share PDF to an app** invokes native file sharing where supported. Choose WhatsApp or a mail app, then select the recipient or group and send.
- **WhatsApp summary** opens WhatsApp with a summary and downloads the PDF. Attach that file manually. A group cannot be preselected reliably by a browser link.
- **Open email app** prepares recipient, subject and text using `mailto:` and downloads the PDF. Attach the file manually.
- **Email draft with PDF** downloads a MIME `.eml` file with the quotation PDF already attached. Outlook / Thunderbird may open this as a draft; other mail apps may open it as a read-only message. Native PDF sharing and mailto remain alternatives.
- **Team quotation file** transfers the complete pricing snapshot to another device for manual history import. It includes internal rates; send the PDF to customers.

The app does not automatically send messages, emails or WhatsApp group posts. Opening a sharing app does not prove delivery. Mark a quotation **Sent** after actually sending it. Team notes and statuses synchronize through the factory database.

## Verification before factory use

Use two separate browsers or devices and two member accounts. Confirm that a reviewed estimate from one appears on the other; confirm that an outsider account cannot read records; confirm a team note and status update are visible on both; and verify that changing rates does not change an old saved quotation's PDF. This live check requires the project's real connection and user accounts and cannot be claimed from local unit tests alone.

## Common connection messages

- **Sign in to shared factory history:** project configuration exists, but there is no active sign-in session.
- **Account has not been added:** create/invite the account and add its member row as above.
- **Table / relation not found:** run `database/supabase.sql` in the selected project.
- **Invalid API key:** check the project URL and public key belong to the same project, then redeploy if using hosting environment variables.
- **Sync error:** the record remains on the device. Check membership/connectivity and press Refresh after fixing it.
