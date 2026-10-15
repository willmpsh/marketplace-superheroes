# Refresh: GLGP Sales Board

Artifact: https://claude.ai/artifact/4fQiaVbMg2tq19AJvHjmog
Needs the Google Drive and Stripe connectors. Work in a scratchpad directory; tool results too big to inline are saved to files, read them with jq.

1. **Sheet.** Google Drive `download_file_content`, fileId `1vsDz6o78A-CP23ctFN4luKGOLv4s1YiZqvJhElqzpdA`,
   exportMimeType `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
   Base64-decode its `content` field to `sheet.xlsx`.
2. **Stripe subscriptions.** Account `acct_1RQOYXIe8YWauukx`, livemode true. `stripe_api_read` `GetSubscriptionsSearch` with
   `limit: 100` and query
   `metadata['thrivecart_product_id']:'164' OR metadata['thrivecart_product_id']:'166' OR metadata['thrivecart_product_id']:'168' OR metadata['thrivecart_product_id']:'193' OR metadata['thrivecart_product_id']:'198' OR metadata['thrivecart_product_id']:'203'`.
   Repeat with `page: <next_page>` until `has_more` is false. Flatten every page into one file:
   `jq -s '[.[].data[] | {id, status, product: .plan.product, rebills: .metadata.thrivecart_fixed_rebills, created, ended_at, reason: .cancellation_details.reason}]' page*.json > subs.json`
3. **Stripe refunds.** Same account. `GetRefunds` with `limit: 100`, `created: {gte: 1772323200}`, `expand: ["data.charge"]`;
   repeat with `starting_after: <last id>` until `has_more` is false. Flatten:
   `jq -s '[.[].data[] | {id, amount, status, created, desc: .charge.description, customer: .charge.customer}]' refund*.json > refunds.json`
4. `pip install openpyxl pandas`, then
   `python scripts/sales_dashboard/stripe_summary.py subs.json refunds.json stripe.json` and
   `python scripts/sales_dashboard/build.py sheet.xlsx stripe.json glgp-sales.html`.
5. Artifact `read` the URL above, then publish `glgp-sales.html` with that `url`.

A new GLGP offer means a new Stripe product: add its ThriveCart product id to the query in step 2 and its Stripe product id to `PRODUCTS` in `stripe_summary.py`.
If any step fails, do not publish a partial page; report which step failed.
