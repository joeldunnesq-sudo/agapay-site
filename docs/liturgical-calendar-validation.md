# Liturgical Calendar Validation

AGAPAY computes Orthodox Pascha with the public-domain Meeus Julian algorithm, converts that Julian date to the civil Gregorian date through Julian Day Number conversion, and derives moveable feasts by offset. Fixed feasts are direct civil dates for `gregorian` parishes and Julian fixed dates converted to civil Gregorian dates for `julian` parishes.

Validation sources checked:

- Ponomar was consulted only as an external reference target. No Ponomar code, data files, or algorithms were imported or ported.
- ACROD published movable-feast tables list 2024-2027 Pascha, Triodion, Great Lent, Palm Sunday, Holy Friday, Ascension, Pentecost, and Apostles' Fast dates.
- OCA daily lives pages were checked for fixed New Calendar feasts and Pascha, including Theophany on January 6 and Holy Pascha on April 12, 2026.

One published-calendar wrinkle: ACROD's New Calendar table marks the 2024 Apostles' Fast as `*` / zero days because Pascha is late. AGAPAY still exposes the Monday-after-All-Saints start marker because the product requirement explicitly asked for the Apostles' Fast start as a Pascha offset shared by both calendar modes. If we later want strict fast-duration behavior, this one entry should be suppressed when the computed start falls after the calendar's Peter and Paul date.

## Comparison Summary

| Year | AGAPAY Pascha | ACROD / OCA Published Pascha | Match |
| --- | --- | --- | --- |
| 2024 | 2024-05-05 | 2024-05-05 | Yes |
| 2025 | 2025-04-20 | 2025-04-20 | Yes |
| 2026 | 2026-04-12 | 2026-04-12 | Yes |
| 2027 | 2027-05-02 | 2027-05-02 | Yes |

| Check | AGAPAY | Published Reference | Match |
| --- | --- | --- | --- |
| New Calendar Theophany 2026 | 2026-01-06 | OCA: Theophany on Jan 6, 2026 | Yes |
| New Calendar Holy Pascha 2026 | 2026-04-12 | OCA: Holy Pascha on Apr 12, 2026 | Yes |
| Old Calendar Nativity 2026 | 2026-01-07 | Julian Dec 25 converts to civil Jan 7 | Yes |
| Old Calendar Theophany 2026 | 2026-01-19 | Julian Jan 6 converts to civil Jan 19 | Yes |

## Computed Feast Lists

### 2024 Julian / Old Calendar

2024-01-07 Nativity of Christ; 2024-01-14 Circumcision of the Lord / St Basil; 2024-01-19 Theophany; 2024-02-15 Meeting of the Lord; 2024-02-25 Triodion Begins; 2024-03-10 Meatfare Sunday; 2024-03-17 Cheesefare / Forgiveness Sunday; 2024-03-18 Clean Monday / Great Lent Begins; 2024-03-24 Sunday of Orthodoxy; 2024-04-07 Annunciation; 2024-04-27 Lazarus Saturday; 2024-04-28 Palm Sunday; 2024-04-29 Great and Holy Monday; 2024-04-30 Great and Holy Tuesday; 2024-05-01 Great and Holy Wednesday; 2024-05-02 Great and Holy Thursday; 2024-05-03 Great and Holy Friday; 2024-05-04 Great and Holy Saturday; 2024-05-05 Holy Pascha; 2024-05-06 Bright Monday; 2024-05-10 Bright Friday; 2024-05-29 Mid-Pentecost; 2024-06-13 Ascension; 2024-06-23 Pentecost; 2024-06-30 All Saints Sunday; 2024-07-01 Apostles' Fast Begins; 2024-07-12 Holy Apostles Peter and Paul; 2024-08-19 Transfiguration; 2024-08-28 Dormition; 2024-09-21 Nativity of the Theotokos; 2024-09-27 Exaltation of the Cross; 2024-10-14 Protection of the Theotokos; 2024-12-04 Entrance of the Theotokos.

### 2024 Gregorian / New Calendar

2024-01-01 Circumcision of the Lord / St Basil; 2024-01-06 Theophany; 2024-02-02 Meeting of the Lord; 2024-02-25 Triodion Begins; 2024-03-10 Meatfare Sunday; 2024-03-17 Cheesefare / Forgiveness Sunday; 2024-03-18 Clean Monday / Great Lent Begins; 2024-03-24 Sunday of Orthodoxy; 2024-03-25 Annunciation; 2024-04-27 Lazarus Saturday; 2024-04-28 Palm Sunday; 2024-04-29 Great and Holy Monday; 2024-04-30 Great and Holy Tuesday; 2024-05-01 Great and Holy Wednesday; 2024-05-02 Great and Holy Thursday; 2024-05-03 Great and Holy Friday; 2024-05-04 Great and Holy Saturday; 2024-05-05 Holy Pascha; 2024-05-06 Bright Monday; 2024-05-10 Bright Friday; 2024-05-29 Mid-Pentecost; 2024-06-13 Ascension; 2024-06-23 Pentecost; 2024-06-29 Holy Apostles Peter and Paul; 2024-06-30 All Saints Sunday; 2024-07-01 Apostles' Fast Begins; 2024-08-06 Transfiguration; 2024-08-15 Dormition; 2024-09-08 Nativity of the Theotokos; 2024-09-14 Exaltation of the Cross; 2024-10-01 Protection of the Theotokos; 2024-11-21 Entrance of the Theotokos; 2024-12-25 Nativity of Christ.

### 2025 Julian / Old Calendar

2025-01-07 Nativity of Christ; 2025-01-14 Circumcision of the Lord / St Basil; 2025-01-19 Theophany; 2025-02-09 Triodion Begins; 2025-02-15 Meeting of the Lord; 2025-02-23 Meatfare Sunday; 2025-03-02 Cheesefare / Forgiveness Sunday; 2025-03-03 Clean Monday / Great Lent Begins; 2025-03-09 Sunday of Orthodoxy; 2025-04-07 Annunciation; 2025-04-12 Lazarus Saturday; 2025-04-13 Palm Sunday; 2025-04-14 Great and Holy Monday; 2025-04-15 Great and Holy Tuesday; 2025-04-16 Great and Holy Wednesday; 2025-04-17 Great and Holy Thursday; 2025-04-18 Great and Holy Friday; 2025-04-19 Great and Holy Saturday; 2025-04-20 Holy Pascha; 2025-04-21 Bright Monday; 2025-04-25 Bright Friday; 2025-05-14 Mid-Pentecost; 2025-05-29 Ascension; 2025-06-08 Pentecost; 2025-06-15 All Saints Sunday; 2025-06-16 Apostles' Fast Begins; 2025-07-12 Holy Apostles Peter and Paul; 2025-08-19 Transfiguration; 2025-08-28 Dormition; 2025-09-21 Nativity of the Theotokos; 2025-09-27 Exaltation of the Cross; 2025-10-14 Protection of the Theotokos; 2025-12-04 Entrance of the Theotokos.

### 2025 Gregorian / New Calendar

2025-01-01 Circumcision of the Lord / St Basil; 2025-01-06 Theophany; 2025-02-02 Meeting of the Lord; 2025-02-09 Triodion Begins; 2025-02-23 Meatfare Sunday; 2025-03-02 Cheesefare / Forgiveness Sunday; 2025-03-03 Clean Monday / Great Lent Begins; 2025-03-09 Sunday of Orthodoxy; 2025-03-25 Annunciation; 2025-04-12 Lazarus Saturday; 2025-04-13 Palm Sunday; 2025-04-14 Great and Holy Monday; 2025-04-15 Great and Holy Tuesday; 2025-04-16 Great and Holy Wednesday; 2025-04-17 Great and Holy Thursday; 2025-04-18 Great and Holy Friday; 2025-04-19 Great and Holy Saturday; 2025-04-20 Holy Pascha; 2025-04-21 Bright Monday; 2025-04-25 Bright Friday; 2025-05-14 Mid-Pentecost; 2025-05-29 Ascension; 2025-06-08 Pentecost; 2025-06-15 All Saints Sunday; 2025-06-16 Apostles' Fast Begins; 2025-06-29 Holy Apostles Peter and Paul; 2025-08-06 Transfiguration; 2025-08-15 Dormition; 2025-09-08 Nativity of the Theotokos; 2025-09-14 Exaltation of the Cross; 2025-10-01 Protection of the Theotokos; 2025-11-21 Entrance of the Theotokos; 2025-12-25 Nativity of Christ.

### 2026 Julian / Old Calendar

2026-01-07 Nativity of Christ; 2026-01-14 Circumcision of the Lord / St Basil; 2026-01-19 Theophany; 2026-02-01 Triodion Begins; 2026-02-15 Meatfare Sunday; 2026-02-15 Meeting of the Lord; 2026-02-22 Cheesefare / Forgiveness Sunday; 2026-02-23 Clean Monday / Great Lent Begins; 2026-03-01 Sunday of Orthodoxy; 2026-04-04 Lazarus Saturday; 2026-04-05 Palm Sunday; 2026-04-06 Great and Holy Monday; 2026-04-07 Annunciation; 2026-04-07 Great and Holy Tuesday; 2026-04-08 Great and Holy Wednesday; 2026-04-09 Great and Holy Thursday; 2026-04-10 Great and Holy Friday; 2026-04-11 Great and Holy Saturday; 2026-04-12 Holy Pascha; 2026-04-13 Bright Monday; 2026-04-17 Bright Friday; 2026-05-06 Mid-Pentecost; 2026-05-21 Ascension; 2026-05-31 Pentecost; 2026-06-07 All Saints Sunday; 2026-06-08 Apostles' Fast Begins; 2026-07-12 Holy Apostles Peter and Paul; 2026-08-19 Transfiguration; 2026-08-28 Dormition; 2026-09-21 Nativity of the Theotokos; 2026-09-27 Exaltation of the Cross; 2026-10-14 Protection of the Theotokos; 2026-12-04 Entrance of the Theotokos.

### 2026 Gregorian / New Calendar

2026-01-01 Circumcision of the Lord / St Basil; 2026-01-06 Theophany; 2026-02-01 Triodion Begins; 2026-02-02 Meeting of the Lord; 2026-02-15 Meatfare Sunday; 2026-02-22 Cheesefare / Forgiveness Sunday; 2026-02-23 Clean Monday / Great Lent Begins; 2026-03-01 Sunday of Orthodoxy; 2026-03-25 Annunciation; 2026-04-04 Lazarus Saturday; 2026-04-05 Palm Sunday; 2026-04-06 Great and Holy Monday; 2026-04-07 Great and Holy Tuesday; 2026-04-08 Great and Holy Wednesday; 2026-04-09 Great and Holy Thursday; 2026-04-10 Great and Holy Friday; 2026-04-11 Great and Holy Saturday; 2026-04-12 Holy Pascha; 2026-04-13 Bright Monday; 2026-04-17 Bright Friday; 2026-05-06 Mid-Pentecost; 2026-05-21 Ascension; 2026-05-31 Pentecost; 2026-06-07 All Saints Sunday; 2026-06-08 Apostles' Fast Begins; 2026-06-29 Holy Apostles Peter and Paul; 2026-08-06 Transfiguration; 2026-08-15 Dormition; 2026-09-08 Nativity of the Theotokos; 2026-09-14 Exaltation of the Cross; 2026-10-01 Protection of the Theotokos; 2026-11-21 Entrance of the Theotokos; 2026-12-25 Nativity of Christ.

### 2027 Julian / Old Calendar

2027-01-07 Nativity of Christ; 2027-01-14 Circumcision of the Lord / St Basil; 2027-01-19 Theophany; 2027-02-15 Meeting of the Lord; 2027-02-21 Triodion Begins; 2027-03-07 Meatfare Sunday; 2027-03-14 Cheesefare / Forgiveness Sunday; 2027-03-15 Clean Monday / Great Lent Begins; 2027-03-21 Sunday of Orthodoxy; 2027-04-07 Annunciation; 2027-04-24 Lazarus Saturday; 2027-04-25 Palm Sunday; 2027-04-26 Great and Holy Monday; 2027-04-27 Great and Holy Tuesday; 2027-04-28 Great and Holy Wednesday; 2027-04-29 Great and Holy Thursday; 2027-04-30 Great and Holy Friday; 2027-05-01 Great and Holy Saturday; 2027-05-02 Holy Pascha; 2027-05-03 Bright Monday; 2027-05-07 Bright Friday; 2027-05-26 Mid-Pentecost; 2027-06-10 Ascension; 2027-06-20 Pentecost; 2027-06-27 All Saints Sunday; 2027-06-28 Apostles' Fast Begins; 2027-07-12 Holy Apostles Peter and Paul; 2027-08-19 Transfiguration; 2027-08-28 Dormition; 2027-09-21 Nativity of the Theotokos; 2027-09-27 Exaltation of the Cross; 2027-10-14 Protection of the Theotokos; 2027-12-04 Entrance of the Theotokos.

### 2027 Gregorian / New Calendar

2027-01-01 Circumcision of the Lord / St Basil; 2027-01-06 Theophany; 2027-02-02 Meeting of the Lord; 2027-02-21 Triodion Begins; 2027-03-07 Meatfare Sunday; 2027-03-14 Cheesefare / Forgiveness Sunday; 2027-03-15 Clean Monday / Great Lent Begins; 2027-03-21 Sunday of Orthodoxy; 2027-03-25 Annunciation; 2027-04-24 Lazarus Saturday; 2027-04-25 Palm Sunday; 2027-04-26 Great and Holy Monday; 2027-04-27 Great and Holy Tuesday; 2027-04-28 Great and Holy Wednesday; 2027-04-29 Great and Holy Thursday; 2027-04-30 Great and Holy Friday; 2027-05-01 Great and Holy Saturday; 2027-05-02 Holy Pascha; 2027-05-03 Bright Monday; 2027-05-07 Bright Friday; 2027-05-26 Mid-Pentecost; 2027-06-10 Ascension; 2027-06-20 Pentecost; 2027-06-27 All Saints Sunday; 2027-06-28 Apostles' Fast Begins; 2027-06-29 Holy Apostles Peter and Paul; 2027-08-06 Transfiguration; 2027-08-15 Dormition; 2027-09-08 Nativity of the Theotokos; 2027-09-14 Exaltation of the Cross; 2027-10-01 Protection of the Theotokos; 2027-11-21 Entrance of the Theotokos; 2027-12-25 Nativity of Christ.
