// Synthetic, normalized CSV examples. These are not exports from a customer's books.
export const onboardingFixtures = ['aplos', 'quickbooks'].map((sourceSystem) => {
  const aplos = sourceSystem === 'aplos';
  return {
    sourceSystem,
    chart: {
      filename: `${sourceSystem}-accounts.csv`,
      csv: [
        aplos ? 'Account ID,Account Number,Account Name,Account Type,Balance' : 'ID,Num,Full Name,Type,Balance',
        'bank,1010,Operating Checking,Bank,25000.00',
        'equipment,1350,Rehearsal Equipment,Fixed Asset,5000.00',
        'payable,2000,Accounts Payable,Accounts Payable,2000.00',
        'unrestricted,3000,Net Assets Without Donor Restrictions,Equity,18000.00',
        'restricted,3100,Net Assets With Donor Restrictions,Equity,10000.00',
        'income,4010,General Donations,Income,0.00',
        'utilities,6200,Rehearsal Utilities,Expense,0.00',
      ].join('\n'),
      columnMap: aplos ? {} : { sourceRef: 'ID', accountNumber: 'Num', name: 'Full Name', type: 'Type' },
      typeMap: {
        Bank: 'asset',
        'Fixed Asset': 'asset',
        'Accounts Payable': 'liability',
        Equity: 'net_asset',
        Income: 'revenue',
        Expense: 'expense',
      },
    },
    vendors: {
      filename: `${sourceSystem}-vendors.csv`,
      csv: 'Vendor Name,Email\nRehearsal Supplies,vendor@example.invalid\nRehearsal Supplies,vendor@example.invalid',
    },
    funds: {
      filename: `${sourceSystem}-funds.csv`,
      csv: 'Fund ID,Fund Name\ngeneral,General Operating Fund\nbuilding,Rehearsal Building Fund',
    },
    opening: {
      filename: `${sourceSystem}-trial-balance.csv`,
      csv: 'Account,Debit,Credit,Fund\nbank,15000.00,,general\nequipment,5000.00,,general\npayable,,2000.00,general\nunrestricted,,18000.00,general\nbank,10000.00,,building\nrestricted,,10000.00,building',
    },
  };
});
