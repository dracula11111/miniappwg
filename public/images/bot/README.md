Bot welcome media lives in this folder.

- Put the welcome image here as `startNtf.png`.
- Public URL in production: `/images/bot/startNtf.png`.
- The Telegram welcome webhook uses this path by default when `WEBAPP_URL` is set.

Optional environment overrides:

- `TG_WELCOME_PHOTO_URL` - direct image URL or Telegram `file_id`.
- `TG_WELCOME_MINI_APP_URL` - Mini App URL for the welcome button.
- `TG_WELCOME_BUTTON_TEXT` - label for the welcome button.
- `TG_WELCOME_BUTTON_STYLE` - `primary`, `success`, or `danger`.
