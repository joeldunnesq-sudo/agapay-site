(function () {
  const calculator = document.querySelector('.op-impact-calculator');
  if (!calculator) return;

  const volume = calculator.querySelector('#volumeRange');
  const coverage = calculator.querySelector('#coverageRange');
  const averageGift = calculator.querySelector('#averageGiftInput');
  const cardRates = Array.from(calculator.querySelectorAll('input[name="cardRate"]'));
  const error = calculator.querySelector('#calculatorError');
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const wholeMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const formatCents = (cents) => money.format(cents / 100);
  const display = (id, value) => { calculator.querySelector(`#${id}`).textContent = value; };

  function updateCalculator() {
    [volume, coverage].forEach((slider) => {
      const progress = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
      slider.style.setProperty('--range-progress', `${progress * 100}%`);
    });
    display('volumeDisplay', wholeMoney.format(Number(volume.value)));
    display('coverageDisplay', `${coverage.value}%`);

    const invalid = averageGift.value.trim() === '' || !Number.isFinite(Number(averageGift.value))
      || Number(averageGift.value) < Number(averageGift.min) || Number(averageGift.value) > Number(averageGift.max);
    averageGift.setAttribute('aria-invalid', String(invalid));
    error.hidden = !invalid;
    if (invalid) {
      error.textContent = 'Enter an average gift from $5 to $5,000 to update the estimate.';
      display('giftAssumption', 'Enter valid amounts to calculate the estimated number of gifts.');
      for (const id of ['grossDisplay', 'stripeDisplay', 'coveredDisplay', 'parishFeesDisplay', 'netDisplay', 'yieldDisplay', 'reconcileDisplay']) display(id, '—');
      return;
    }

    // Restore the retired pricing-page model: estimate base-gift fees, then
    // offset the donor-covered share. This is not a per-checkout gross-up quote.
    const monthlyVolume = Number(volume.value);
    const monthlyCents = Math.round(monthlyVolume * 100);
    const transactions = Math.max(1, Math.round(monthlyVolume / Number(averageGift.value)));
    const cardRate = Number(cardRates.find((input) => input.checked).value);
    const stripeCents = Math.round(monthlyCents * cardRate / 100) + transactions * 30;
    const coveredCents = Math.round(stripeCents * Number(coverage.value) / 100);
    const parishCents = stripeCents - coveredCents;
    const netCents = monthlyCents - parishCents;
    display('giftAssumption', `About ${transactions.toLocaleString('en-US')} gifts per month. The $0.30 per-gift fee uses this estimated count.`);
    display('grossDisplay', formatCents(monthlyCents));
    display('stripeDisplay', stripeCents ? `−${formatCents(stripeCents)}` : formatCents(0));
    display('coveredDisplay', coveredCents ? `+${formatCents(coveredCents)}` : formatCents(0));
    display('parishFeesDisplay', parishCents ? `−${formatCents(parishCents)}` : formatCents(0));
    display('netDisplay', formatCents(netCents));
    display('yieldDisplay', `${(netCents / monthlyCents * 100).toFixed(2)}%`);
    display('reconcileDisplay', `${formatCents(monthlyCents)} − ${formatCents(parishCents)} = ${formatCents(netCents)}`);
  }

  [volume, coverage, averageGift].forEach((input) => input.addEventListener('input', updateCalculator));
  cardRates.forEach((input) => input.addEventListener('change', updateCalculator));
  updateCalculator();
})();
