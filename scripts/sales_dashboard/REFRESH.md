# Daily refresh: GLGP Sales Board

Artifact: https://claude.ai/artifact/4fQiaVbMg2tq19AJvHjmog

1. Google Drive `download_file_content`, fileId `1vsDz6o78A-CP23ctFN4luKGOLv4s1YiZqvJhElqzpdA`,
   exportMimeType `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
   The result is too big to inline; base64-decode its `content` field to `sheet.xlsx`.
2. SegMetrics `get-account-info`: take `data_summary.data_until` (date part) as `synced_until`.
3. SegMetrics `run-query` (subscriptions):
   type `subscriptions`, metrics `["subscriptions","subscriptions_all","cancellations","mrr"]`,
   dimensions `["subscriptions.product_name"]`,
   filters `[{"id":"subscriptions.product_name","type":"PT","value":"Go Live"}]`,
   date_range `2026-03-01` to today.
4. SegMetrics `run-query` (refunds):
   type `revenue`, metrics `["refunds"]`, dimensions `["orders.product_name"]`,
   filters `[{"id":"orders.product_name","type":"PT","value":"Go Live"}]`,
   date_range `2026-03-01` to today.
5. Write `stripe.json` as `{"synced_until": ..., "subscriptions": <step 3 result>, "refunds": <step 4 result>}`.
6. `pip install openpyxl pandas` then
   `python scripts/sales_dashboard/build.py sheet.xlsx stripe.json glgp-sales.html`.
7. Artifact `read` the URL above, then publish `glgp-sales.html` with that `url`.

If any step fails, do not publish a partial page; report which step failed.
