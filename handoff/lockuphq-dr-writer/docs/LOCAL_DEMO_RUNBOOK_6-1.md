# Local Demo Runbook - Charge 6-1

Project name: LockUpHQ DR Assist

The local folder may currently be named `LockUpHQ DR Assit`. Do not rename it automatically.

## Confirm The Project Folder

You are in the right folder if these exist:

- `package.json`
- `src`
- `prototypes`
- `docs`

## Start Mock Demo Mode

Mock mode does not require an API key.

```powershell
cd "C:\Users\tyler\OneDrive\Desktop\LockUpHQ DR Assit"
npm install
npm run dev:6-1:ui
```

Open:

```text
http://127.0.0.1:5176/charge-6-1
```

## Start Live Demo Mode

Use live mode only with fake/practice data.

Set the API key only in the same PowerShell session used to start the dev server:

```powershell
cd "C:\Users\tyler\OneDrive\Desktop\LockUpHQ DR Assit"
$env:ANTHROPIC_API_KEY = "your-real-key-here"
npm run dev:6-1:ui
```

Open:

```text
http://127.0.0.1:5176/charge-6-1
```

Live mode still requires explicit selection and confirmation in the UI.

## Safety Notes

- Do not save the API key into txt files.
- Do not save the API key into docs.
- Do not include the API key in screenshots.
- Do not commit the API key to git.
- Do not paste the API key into chat logs.
- Do not use real inmate data.
- Do not paste real officer reports into the demo.
