# Publish Sachin CutCost with GitHub and Vercel

The project already contains its Vercel build configuration. This guide uses GitHub Desktop so publishing and future updates do not require terminal commands. These instructions do not mean that a GitHub repository or live Vercel project has already been created.

## 1. Put this project on GitHub

1. Create a GitHub account if needed, then install [GitHub Desktop](https://desktop.github.com/) and sign in.
2. In GitHub Desktop, choose **File → Add local repository**.
3. Choose this project folder:

   ```text
   C:\Users\Ayush Agarwal\Documents\ChatGPT\sachin cost
   ```

4. Click **Add repository**. This workspace already has Git initialized. If using an extracted source ZIP on another PC, use the offered **create a repository here** option without creating another nested source folder.
5. In Changes, enter `Initial factory costing app` as the summary, then click **Commit to main** (or the current branch name shown). This original workspace currently uses `main`.
6. Click **Publish repository**. Set its name to `sachin-cutcost`, leave **Keep this code private** checked, and click **Publish repository**.

The repository root must contain `package.json`, `package-lock.json`, `index.html`, `vercel.json`, `src/`, `public/` and `scripts/`. Publish the source project rather than the deployment ZIP or the `dist` directory.

The Git ignore rules exclude dependencies, built output, private DXF test copies, environment files, generated ZIPs, PDFs and CAD screenshots. `output/DXF-validation.md` remains included as documentation. Keep customer CAD files outside the source folders.

GitHub's [Desktop publishing guide](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop) describes the same publishing flow.

## 2. Import it into Vercel

1. Open [Vercel's new project page](https://vercel.com/new), sign in with GitHub, and choose the account that owns your repository.
2. When connecting the Vercel GitHub app, grant it access to `sachin-cutcost`. If the repository is missing from the import list, configure GitHub access to include it.
3. Click **Import** beside `sachin-cutcost`.
4. Check these project settings:

   | Setting | Value |
   | --- | --- |
   | Framework preset | Vite |
   | Root directory | `./` — the folder containing `package.json` |
   | Install command | `npm ci` |
   | Build command | `npm run build` |
   | Output directory | `dist` |
   | Node.js version | `24.x` |

5. Click **Deploy** and wait for the deployment to show **Ready**. Open the production domain displayed by Vercel; its exact name depends on availability.
6. In project Git settings, check that the production branch matches the branch you published (`main` in this workspace). Changes on other branches normally receive preview deployments.

Vercel builds the app and supplies the HTTPS site. You do not have to leave your PC or its local development server running. See [Vercel's Git deployment guide](https://vercel.com/docs/git) and [Vite support](https://vercel.com/docs/frameworks/frontend/vite).

Vercel restricts Hobby to personal, non-commercial use. This app supports factory costing, so use a plan that permits your business use rather than assuming internal-only means non-commercial. See [Vercel's fair-use rules](https://vercel.com/docs/limits/fair-use-guidelines).

## 3. Connect automatic shared history

The calculator, CAD editor and PDF export work without a database. Automatic cross-device costing history needs the managed Supabase project described in [SHARED_HISTORY_SETUP.md](SHARED_HISTORY_SETUP.md).

Create that project, run `database/supabase.sql`, create the factory accounts and add them to `cutcost_members`. Then add these in **Vercel project → Settings → Environment Variables**:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Use the project's public publishable or anon key. Never put a secret/service-role key here. Apply the variables to Production and redeploy; Vite includes them at build time. Only use them on Preview deployments if you intend those previews to access the same factory database.

On each factory device, open the live site, go to **Communication centre**, and sign in with a factory member account. Confirm that a reviewed estimate on one device appears on a second device before relying on automatic history. No Supabase project has been connected by this guide alone.

## 4. Move your existing local work

Browser storage belongs to the site's address and browser profile. The new Vercel site starts with separate local storage; deploying code does not move projects from localhost.

1. On the old local site, use **Rates & settings → Download backup** (or the backup shortcut).
2. Open the live site in the desired browser and use **Rates & settings → Restore backup** to select that JSON backup.
3. Check the restored jobs and settings. Keep the backup file separately.

CAD source files and editable drafts are local data. Shared history sends costing/quotation snapshots rather than all original CAD files. See the shared-history guide for its exact scope.

## 5. Install on phones and publish future changes

Open the production HTTPS address in Android Chrome, then choose **three dots → Install app / Add to Home screen**. On iPhone Safari use **Share → Add to Home Screen**.

For updates, edit this same local project folder, test it, then open GitHub Desktop: review Changes, enter a summary, **Commit**, and **Push origin**. Vercel automatically builds connected Git pushes; a successful production-branch deployment updates the production site. Refresh the app after the new deployment is Ready. See [Vercel's GitHub integration](https://vercel.com/docs/git/vercel-for-github).

## Private repository and site access

A private GitHub repository hides the source repository. The live website needs its own access control if you want to restrict who can open it. Supabase sign-in and membership protect shared factory records; they do not lock the whole calculator page.

Vercel's **Settings → Deployment Protection → All Deployments** includes the production site. Choose the authentication method that suits your factory; available methods and pricing depend on the plan. See [Deployment Protection](https://vercel.com/docs/deployment-protection).
