# Approved 02: pure white, champagne controls, gray navigation

The user selected the attached “02 純白・香檳金鍵” proposal, requested light gray instead of yellow for the moving bottom navigation frame, and authorized production deployment.

- White chart and panel surfaces, smoky graphite text, readable gray secondary text.
- Champagne button fills and fine panel accents; directional market data retains blue/red for crypto and red/green for Taiwan.
- The entire dock border and moving selection use neutral gray, including the radar tab. Existing navigation geometry, transitions and gestures stay intact.
- Shared role CSS reaches lazy shadow-root indicator rails, pattern tools, bubbles, analytics and ETF/savings tools. All styles are gated by the light theme.
- Theme switching preserves chart instances and visible ranges. No market logic or content layout was redesigned from generated imagery.

Validation: 415 unit tests, build asset/ID validation, mobile and desktop light-theme audits, actual native-chart and candle-color checks. The dedicated palette browser check verifies five dock positions, neutral gray fills/borders, charcoal labels, white/gold home surfaces, champagne timeframes, lazy tool selection and an unchanged dark-theme round trip.

The broad mobile audit captured 113 states without dark residual surfaces, horizontal overflow or runtime errors. Desktop audit results are recorded in the release verification. Screenshots use intercepted market fixtures, not current quotes; generated concepts were not shipped as product UI.
