-- St. Fiacre already has its original $75 roof-campaign demo gift. Remove the
-- duplicate synthetic copy introduced with the expanded supporter history so
-- the eight displayed gifts total $5,575.00 (55.75% of the goal).
DELETE FROM donor_offerings
WHERE id = 'demo_st_fiacre_demo_don_021'
  AND parish_id = 'st-fiacre'
  AND json_extract(data, '$.campaignId') = 'alms';
-- Original filename retained because D1 identifies applied migrations by filename.
