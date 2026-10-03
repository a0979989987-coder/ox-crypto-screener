# US end-of-day data request — unsent draft

Prepared 2026-10-03. This is a request for information and a possible free project grant. It is not an application acceptance, a purchase, a redistribution agreement, or permission to publish any dataset. Do not send without the owner's explicit authorization.

Official starting points checked on 2026-10-03:

- https://www.alphavantage.co/support/ — standard free access is 25 requests/day; verified open-source or educational projects may request unlimited access.
- https://www.alphavantage.co/terms_of_service/ — personal/noncommercial terms do not establish permission for this publicly accessible product; a written agreement is needed for other use.

The repository is publicly viewable but has no declared open-source license. Do not call it a verified open-source project or add a license merely to qualify. Quota relief and public-display permission are separate questions.

## Proposed email

To: support@alphavantage.co

Cc: premium@alphavantage.co

Subject: Free project eligibility and public EOD display permission — OX market dashboard

Hello Alpha Vantage team,

We maintain OX, a Traditional Chinese market dashboard covering cryptocurrency, Taiwan equities, and a planned US equities end-of-day experience.

Project: https://github.com/a0979989987-coder/ox-crypto-screener

Public website: https://a0979989987-coder.github.io/ox-crypto-screener/

We would like to ask whether the project could qualify for a free sponsored or educational arrangement. The source repository is publicly viewable but currently has no declared open-source license, and we are not claiming verified open-source status. The site includes account/membership and affiliate-related features, so please do not assume the product qualifies as noncommercial.

The proposed US functionality uses completed daily OHLCV only, with no intraday or real-time service. We would store historical bars and refresh the latest completed session once per trading day, aggregate weekly/monthly bars, and render native OX candlestick charts. We would also compute technical pattern searches, ranked radar candidates, bubbles, and homepage summaries from those bars. Initially we need about 400 daily bars per stock, across several hundred stocks and ETFs, with broader exchange coverage if permitted.

Could you confirm in writing:

1. Whether a free project grant is available for this use, its actual quotas, and the supported symbol coverage and history depth.
2. Whether unauthenticated website visitors may view prices, native OHLCV charts, and the derived analyses, including any required exchange agreements or fees.
3. Whether durable server-side historical caching, daily updates, browser delivery of bars needed for native charting, and user-side chart caching are permitted, including retention and attribution conditions.
4. Whether membership or affiliate features change eligibility or require a different agreement.

This inquiry authorizes no paid plan, recurring charge, or contract acceptance. If the proposed use cannot be supported at no cost, please let us know the limitation before taking any action.

Thank you,

OX project owner
