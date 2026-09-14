// Shared classic-script presentation helpers for Bookstore and giving history.
const BOOKSTORE_CATEGORY_LABELS = {
  book: "Book",
  prayer_rope: "Prayer Rope",
  icon: "Icon",
  candle: "Candle",
  jewelry: "Jewelry / Cross",
  incense: "Incense",
  cd_dvd: "CD / DVD",
  other: "Other Item"
};

const BOOKSTORE_STATUS_LABELS = {
  checkout_created: "Awaiting payment",
  completed: "Paid",
  failed: "Payment failed",
  expired: "Checkout expired",
  refunded: "Refunded"
};

function formatCentsAsDollars(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

