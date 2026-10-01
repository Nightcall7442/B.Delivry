# @bazar/vendor

Bazar Seller — the stall owner's app: incoming orders (accept, decline, what to gather), goods and stock, the stall (open/closed, hours, counter photograph, revenue), haggling. Expo + Expo Router; routes live in `src/app`, feature slices in `src/features`.

New orders are heard while the app is open (socket + a poll every few seconds, a vibrating alert until acknowledged); the Telegram bot carries them when it is closed.
