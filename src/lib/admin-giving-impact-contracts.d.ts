interface GivingTotals {
  cents: number;
  giftCount: number;
}

export interface AdminGivingImpact extends GivingTotals {
  giverCount: number;
  parishes: (GivingTotals & { parishId: string; name: string; giverCount: number })[];
  monthly: (GivingTotals & { month: string })[];
}
