const nowIso = "2026-06-15T12:00:00.000Z";

const learnHousehold = {
  id: "household_martin",
  slug: "martin-family",
  name: "The Martin Family",
  parentNames: ["Stephen Martin", "Rachel Martin"],
  childrenCount: 5,
  primaryMethod: "Charlotte Mason",
  parishName: "St. Catherine Orthodox Church",
  city: "Charlotte, North Carolina",
  liturgicalCalendarType: "julian",
  activeProductSlugs: ["give", "learn"],
  topbarTimeLabel: "9:14 AM"
};

const children = [
  { id: "child_elias", householdId: learnHousehold.id, firstName: "Elias", ageYears: 9, gradeLabel: "Grade 4", avatarMonogram: "E", accentToken: "navy" },
  { id: "child_maria", householdId: learnHousehold.id, firstName: "Maria", ageYears: 7, gradeLabel: "Grade 2", avatarMonogram: "M", accentToken: "wine" },
  { id: "child_nicholas", householdId: learnHousehold.id, firstName: "Nicholas", ageYears: 5, gradeLabel: "Kindergarten", avatarMonogram: "N", accentToken: "forest" },
  { id: "child_anna", householdId: learnHousehold.id, firstName: "Anna", ageYears: 3, gradeLabel: "Pre-K", avatarMonogram: "A", accentToken: "gold" },
  { id: "child_charlotte", householdId: learnHousehold.id, firstName: "Charlotte", ageYears: 1, gradeLabel: "Little Ones", avatarMonogram: "C", accentToken: "plum" }
];

const schoolYear = {
  id: "school_year_2024_2025",
  householdId: learnHousehold.id,
  label: "2024-2025 School Year",
  startDate: "2024-08-19",
  endDate: "2025-06-13",
  currentTermId: "term_pascha"
};

const term = {
  id: "term_pascha",
  schoolYearId: schoolYear.id,
  label: "Pascha Term",
  startDate: "2025-04-21",
  endDate: "2025-07-11",
  paceMode: "grace"
};

const cycleFramework = {
  id: "cycle_framework_history_catechesis",
  frameworkType: "combined",
  title: "History & Catechesis Cycle",
  summary: "A four-year family cycle pairing church history, Scripture memory, and feast-centered catechesis."
};

const cycleYear = {
  id: "cycle_year_2",
  cycleFrameworkId: cycleFramework.id,
  yearNumber: 2,
  title: "Cycle 2: Apostles & Early Church"
};

const cycleTopics = [
  {
    id: "cycle_topic_pascha",
    cycleYearId: cycleYear.id,
    subjectType: "catechesis",
    title: "The Resurrection and the Bright Week witness",
    seasonLabel: "Pascha Season"
  },
  {
    id: "cycle_topic_acts",
    cycleYearId: cycleYear.id,
    subjectType: "history",
    title: "Acts of the Apostles and the spread of the Gospel",
    seasonLabel: "Spring"
  }
];

const curriculumPackage = {
  id: "curriculum_package_st_catherine",
  householdId: learnHousehold.id,
  title: "St. Catherine Learn Package",
  vendor: "AGAPAY Learn",
  sourceKind: "agapay-default",
  summary: "A Charlotte Mason, Orthodox-first package that can be mixed with household custom resources."
};

const curriculumPackages = [
  curriculumPackage,
  {
    id: "curriculum_package_martin_custom",
    householdId: learnHousehold.id,
    title: "Martin Household Custom Additions",
    vendor: "Household",
    sourceKind: "household-custom",
    summary: "Family-chosen living books, parish resources, and copywork sources."
  }
];

const curriculumSubjects = [
  { id: "curr_subject_history", curriculumPackageId: curriculumPackage.id, subjectType: "history", title: "History Cycle", sortOrder: 1 },
  { id: "curr_subject_catechesis", curriculumPackageId: curriculumPackage.id, subjectType: "catechesis", title: "Catechesis Cycle", sortOrder: 2 },
  { id: "curr_subject_enrichment", curriculumPackageId: curriculumPackage.id, subjectType: "enrichment", title: "Enrichment", sortOrder: 3 },
  { id: "curr_subject_recitation", curriculumPackageId: curriculumPackage.id, subjectType: "recitation", title: "Recitation & Memory", sortOrder: 4 },
  { id: "curr_subject_custom_books", curriculumPackageId: "curriculum_package_martin_custom", subjectType: "independent-reading", title: "Household Living Books", sortOrder: 1 }
];

const curriculumResources = [
  { id: "resource_acts", curriculumPackageId: curriculumPackage.id, curriculumSubjectId: "curr_subject_history", title: "Acts of the Apostles", author: "KJV Scripture", resourceType: "scripture", sourceKind: "agapay-default" },
  { id: "resource_creed", curriculumPackageId: curriculumPackage.id, curriculumSubjectId: "curr_subject_catechesis", title: "The Creed Lessons 7-12", author: "AGAPAY Learn", resourceType: "custom", sourceKind: "agapay-default" },
  { id: "resource_giotto", curriculumPackageId: curriculumPackage.id, curriculumSubjectId: "curr_subject_enrichment", title: "Giotto Picture Study", author: "AGAPAY Learn", resourceType: "icon", sourceKind: "agapay-default" },
  { id: "resource_paschal_hymns", curriculumPackageId: curriculumPackage.id, curriculumSubjectId: "curr_subject_recitation", title: "Paschal Hymns", author: "Church Hymnody", resourceType: "hymn", sourceKind: "agapay-default" },
  { id: "resource_wingfeather", curriculumPackageId: "curriculum_package_martin_custom", curriculumSubjectId: "curr_subject_custom_books", title: "The Wingfeather Saga", author: "Andrew Peterson", resourceType: "book", sourceKind: "household-custom" },
  { id: "resource_bronze_bow", curriculumPackageId: "curriculum_package_martin_custom", curriculumSubjectId: "curr_subject_custom_books", title: "The Bronze Bow", author: "Elizabeth George Speare", resourceType: "book", sourceKind: "household-custom" }
];

const curriculumMappings = [
  { id: "mapping_acts_cycle", curriculumPackageId: curriculumPackage.id, curriculumResourceId: "resource_acts", mappingScope: "cycle", targetId: cycleYear.id, cycleFrameworkId: cycleFramework.id, cycleYearId: cycleYear.id, termId: term.id, priority: 1 },
  { id: "mapping_creed_term", curriculumPackageId: curriculumPackage.id, curriculumResourceId: "resource_creed", mappingScope: "term", targetId: term.id, cycleFrameworkId: cycleFramework.id, cycleYearId: cycleYear.id, termId: term.id, priority: 1 },
  { id: "mapping_hymns_stream", curriculumPackageId: curriculumPackage.id, curriculumResourceId: "resource_paschal_hymns", mappingScope: "household-stream", targetId: "stream_morning_basket", termId: term.id, priority: 1 },
  { id: "mapping_giotto_stream", curriculumPackageId: curriculumPackage.id, curriculumResourceId: "resource_giotto", mappingScope: "household-stream", targetId: "stream_morning_basket", termId: term.id, priority: 2 },
  { id: "mapping_wingfeather_stream", curriculumPackageId: "curriculum_package_martin_custom", curriculumResourceId: "resource_wingfeather", mappingScope: "household-stream", targetId: "stream_read_aloud", termId: term.id, priority: 2 },
  { id: "mapping_bronze_bow_elias", curriculumPackageId: "curriculum_package_martin_custom", curriculumResourceId: "resource_bronze_bow", mappingScope: "child-track", targetId: "track_elias_reading", termId: term.id, priority: 3 }
];

const paceProfile = {
  id: "pace_profile_grace",
  householdId: learnHousehold.id,
  title: "Gentle Grace Mode",
  paceMode: "grace"
};

const seasonAdjustment = {
  id: "season_adjustment_new_baby",
  householdId: learnHousehold.id,
  paceProfileId: paceProfile.id,
  title: "New baby season",
  adjustmentKind: "new-baby",
  startsOn: "2025-04-28",
  endsOn: "2025-06-20",
  summary: "Reduce cognitive load, keep family prayers steady, and favor short wins."
};

const graceModeRule = {
  id: "grace_rule_new_baby_light",
  seasonAdjustmentId: seasonAdjustment.id,
  mode: "light",
  preserveChurchRhythms: true,
  preserveMorningBasket: true,
  reducePriorityThreshold: 4,
  changedSummary: [
    "Kept Morning Prayers, Saint of the Day, Gospel Reading, Morning Basket, and Catechesis.",
    "Reduced picture study, fine motor, and optional nature journaling to lighter blocks.",
    "Deferred unfinished art and practical life work to the next available day."
  ]
};

const householdStreams = [
  { id: "stream_morning_basket", householdId: learnHousehold.id, streamType: "morning-basket", title: "Morning Basket", cadenceLabel: "Daily" },
  { id: "stream_read_aloud", householdId: learnHousehold.id, streamType: "family-read-aloud", title: "Family Read-Aloud", cadenceLabel: "Daily" },
  { id: "stream_nature", householdId: learnHousehold.id, streamType: "nature-study", title: "Nature Study", cadenceLabel: "3x weekly" },
  { id: "stream_catechesis", householdId: learnHousehold.id, streamType: "catechesis", title: "Catechesis", cadenceLabel: "Daily" },
  { id: "stream_feast", householdId: learnHousehold.id, streamType: "feast-day-activity", title: "Feast Day Activity", cadenceLabel: "As needed" }
];

const childTracks = [
  { id: "track_elias_math", childId: "child_elias", subjectType: "math", title: "Math" },
  { id: "track_elias_narration", childId: "child_elias", subjectType: "written-narration", title: "Written Narration" },
  { id: "track_elias_copywork", childId: "child_elias", subjectType: "copywork", title: "Copywork" },
  { id: "track_elias_reading", childId: "child_elias", subjectType: "independent-reading", title: "Independent Reading" },
  { id: "track_elias_nature", childId: "child_elias", subjectType: "memory-work", title: "Nature Journal" },
  { id: "track_maria_math", childId: "child_maria", subjectType: "math", title: "Math" },
  { id: "track_maria_phonics", childId: "child_maria", subjectType: "phonics", title: "Phonics" },
  { id: "track_maria_handwriting", childId: "child_maria", subjectType: "handwriting", title: "Handwriting" },
  { id: "track_maria_readaloud", childId: "child_maria", subjectType: "independent-reading", title: "Read-Aloud Time" },
  { id: "track_maria_picture", childId: "child_maria", subjectType: "art", title: "Picture Study" },
  { id: "track_nicholas_math", childId: "child_nicholas", subjectType: "math", title: "Math" },
  { id: "track_nicholas_phonics", childId: "child_nicholas", subjectType: "phonics", title: "Phonics" },
  { id: "track_nicholas_memory", childId: "child_nicholas", subjectType: "memory-work", title: "Memory Work" },
  { id: "track_nicholas_practical", childId: "child_nicholas", subjectType: "practical-life", title: "Practical Life" },
  { id: "track_nicholas_art", childId: "child_nicholas", subjectType: "art", title: "Art" },
  { id: "track_anna_poetry", childId: "child_anna", subjectType: "poetry", title: "Poetry" },
  { id: "track_anna_picture", childId: "child_anna", subjectType: "art", title: "Picture Talk" },
  { id: "track_anna_fine_motor", childId: "child_anna", subjectType: "fine-motor", title: "Fine Motor" },
  { id: "track_anna_blocks", childId: "child_anna", subjectType: "practical-life", title: "Blocks" },
  { id: "track_anna_songs", childId: "child_anna", subjectType: "songs", title: "Songs" }
];

const books = [
  {
    id: "book_wingfeather",
    householdId: learnHousehold.id,
    title: "The Wingfeather Saga",
    author: "Andrew Peterson",
    category: "Living Books"
  },
  {
    id: "book_bronze_bow",
    householdId: learnHousehold.id,
    title: "The Bronze Bow",
    author: "Elizabeth George Speare",
    category: "History"
  }
];

const bookAssignments = [
  {
    id: "assignment_wingfeather_household",
    bookId: "book_wingfeather",
    assignmentType: "household",
    assigneeId: learnHousehold.id,
    progressPercent: 65,
    currentLabel: "Chapter 14 of 24"
  },
  {
    id: "assignment_bronze_bow_elias",
    bookId: "book_bronze_bow",
    assignmentType: "child",
    assigneeId: "child_elias",
    progressPercent: 35,
    currentLabel: "Chapter 5 of 14"
  }
];

const liturgicalWeek = {
  "julian": [
    {
      id: "lit_2025_05_04_julian",
      civilDate: "2025-05-04",
      calendarType: "julian",
      oldStyleDateLabel: "April 21, 2025",
      feastTitle: "Bright Monday",
      feastRank: "bright-week",
      saints: ["St. Theodore the Sykeote"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 3:19-26",
      gospelRef: "John 2:1-11",
      epistleTextKjv: "Repent ye therefore, and be converted, that your sins may be blotted out.",
      gospelTextKjv: "This beginning of miracles did Jesus in Cana of Galilee.",
      troparionText: "Christ is risen from the dead, trampling down death by death.",
      troparionTone: "Tone 5",
      kontakionText: "Though Thou didst descend into the grave, O Immortal One.",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_05_julian",
      civilDate: "2025-05-05",
      calendarType: "julian",
      oldStyleDateLabel: "April 22, 2025",
      feastTitle: "Bright Tuesday",
      feastRank: "bright-week",
      saints: ["St. Irene the Great Martyr"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 4:1-10",
      gospelRef: "John 3:16-21",
      epistleTextKjv: "Neither is there salvation in any other.",
      gospelTextKjv: "For God so loved the world, that he gave his only begotten Son.",
      troparionText: "Christ is risen from the dead, trampling down death by death.",
      troparionTone: "Tone 5",
      kontakionText: "Though Thou didst descend into the grave, O Immortal One.",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_06_julian",
      civilDate: "2025-05-06",
      calendarType: "julian",
      oldStyleDateLabel: "April 23, 2025",
      feastTitle: "Bright Wednesday",
      feastRank: "bright-week",
      saints: ["St. George the Great Martyr"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 5:12-20",
      gospelRef: "John 20:19-25",
      epistleTextKjv: "And by the hands of the apostles were many signs and wonders wrought.",
      gospelTextKjv: "Peace be unto you: as my Father hath sent me, even so send I you.",
      troparionText: "Christ is risen from the dead, trampling down death by death.",
      troparionTone: "Tone 5",
      kontakionText: "Though Thou didst descend into the grave, O Immortal One.",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_07_julian",
      civilDate: "2025-05-07",
      calendarType: "julian",
      oldStyleDateLabel: "April 24, 2025",
      feastTitle: "Midweek of Pascha",
      feastRank: "seasonal",
      saints: ["St. John of the Ladder"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 10:1-16",
      gospelRef: "John 6:56-69",
      epistleTextKjv: "What God hath cleansed, that call not thou common.",
      gospelTextKjv: "Lord, to whom shall we go? thou hast the words of eternal life.",
      troparionText: "Christ is risen from the dead, trampling down death by death, and upon those in the tombs bestowing life!",
      troparionTone: "Tone 5",
      kontakionText: "Though You went down into the tomb, O Immortal One, yet You destroyed the power of Hades, and arose as victor, O Christ God!",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_08_julian",
      civilDate: "2025-05-08",
      calendarType: "julian",
      oldStyleDateLabel: "April 25, 2025",
      feastTitle: "Bright Thursday",
      feastRank: "bright-week",
      saints: ["St. Mark the Apostle"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 8:26-39",
      gospelRef: "John 6:40-44",
      epistleTextKjv: "And he arose and went.",
      gospelTextKjv: "No man can come to me, except the Father which hath sent me draw him.",
      troparionText: "Christ is risen from the dead, trampling down death by death.",
      troparionTone: "Tone 5",
      kontakionText: "Though Thou didst descend into the grave, O Immortal One.",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_09_julian",
      civilDate: "2025-05-09",
      calendarType: "julian",
      oldStyleDateLabel: "April 26, 2025",
      feastTitle: "Apostle and Evangelist Mark",
      feastRank: "major",
      saints: ["St. Mark the Apostle"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "1 Peter 5:6-14",
      gospelRef: "Mark 6:7-13",
      epistleTextKjv: "Casting all your care upon him; for he careth for you.",
      gospelTextKjv: "And they went out, and preached that men should repent.",
      troparionText: "From thy childhood the light of truth enlightened thee, O apostle.",
      troparionTone: "Tone 3",
      kontakionText: "When thou hadst received the grace of the Spirit from on high, O apostle.",
      kontakionTone: "Tone 2"
    },
    {
      id: "lit_2025_05_10_julian",
      civilDate: "2025-05-10",
      calendarType: "julian",
      oldStyleDateLabel: "April 27, 2025",
      feastTitle: "St. Simon the Zealot",
      feastRank: "major",
      saints: ["Apostle Simon the Zealot"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 1:12-17, 21-26",
      gospelRef: "John 1:43-51",
      epistleTextKjv: "And the lot fell upon Matthias; and he was numbered with the eleven apostles.",
      gospelTextKjv: "Behold an Israelite indeed, in whom is no guile!",
      troparionText: "O holy Apostle Simon, entreat the merciful God.",
      troparionTone: "Tone 3",
      kontakionText: "With praises let us all bless Simon the apostle.",
      kontakionTone: "Tone 2"
    }
  ],
  "revised-julian": [
    {
      id: "lit_2025_05_04_revised",
      civilDate: "2025-05-04",
      calendarType: "revised-julian",
      oldStyleDateLabel: "April 21, 2025",
      feastTitle: "Bright Monday",
      feastRank: "bright-week",
      saints: ["St. Monica of Nicomedia"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 3:19-26",
      gospelRef: "John 2:1-11",
      epistleTextKjv: "Repent ye therefore, and be converted, that your sins may be blotted out.",
      gospelTextKjv: "This beginning of miracles did Jesus in Cana of Galilee.",
      troparionText: "Christ is risen from the dead, trampling down death by death.",
      troparionTone: "Tone 5",
      kontakionText: "Though Thou didst descend into the grave, O Immortal One.",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_05_revised",
      civilDate: "2025-05-05",
      calendarType: "revised-julian",
      oldStyleDateLabel: "April 22, 2025",
      feastTitle: "Bright Tuesday",
      feastRank: "bright-week",
      saints: ["Great Martyr Irene"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 4:1-10",
      gospelRef: "John 3:16-21",
      epistleTextKjv: "Neither is there salvation in any other.",
      gospelTextKjv: "For God so loved the world, that he gave his only begotten Son.",
      troparionText: "Christ is risen from the dead, trampling down death by death.",
      troparionTone: "Tone 5",
      kontakionText: "Though Thou didst descend into the grave, O Immortal One.",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_06_revised",
      civilDate: "2025-05-06",
      calendarType: "revised-julian",
      oldStyleDateLabel: "April 23, 2025",
      feastTitle: "Bright Wednesday",
      feastRank: "bright-week",
      saints: ["Righteous Job the Long-Suffering"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 5:12-20",
      gospelRef: "John 20:19-25",
      epistleTextKjv: "And by the hands of the apostles were many signs and wonders wrought.",
      gospelTextKjv: "Peace be unto you: as my Father hath sent me, even so send I you.",
      troparionText: "Christ is risen from the dead, trampling down death by death.",
      troparionTone: "Tone 5",
      kontakionText: "Though Thou didst descend into the grave, O Immortal One.",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_07_revised",
      civilDate: "2025-05-07",
      calendarType: "revised-julian",
      oldStyleDateLabel: "April 24, 2025",
      feastTitle: "Midweek of Pascha",
      feastRank: "seasonal",
      saints: ["St. John of the Ladder"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 10:1-16",
      gospelRef: "John 6:56-69",
      epistleTextKjv: "What God hath cleansed, that call not thou common.",
      gospelTextKjv: "Lord, to whom shall we go? thou hast the words of eternal life.",
      troparionText: "Christ is risen from the dead, trampling down death by death, and upon those in the tombs bestowing life!",
      troparionTone: "Tone 5",
      kontakionText: "Though You went down into the tomb, O Immortal One, yet You destroyed the power of Hades, and arose as victor, O Christ God!",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_08_revised",
      civilDate: "2025-05-08",
      calendarType: "revised-julian",
      oldStyleDateLabel: "April 25, 2025",
      feastTitle: "St. John the Theologian",
      feastRank: "major",
      saints: ["Holy Apostle and Evangelist John the Theologian"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "1 John 1:1-7",
      gospelRef: "John 19:25-27; 21:24-25",
      epistleTextKjv: "That which we have seen and heard declare we unto you.",
      gospelTextKjv: "This is the disciple which testifieth of these things.",
      troparionText: "Beloved Apostle of Christ our God, hasten to deliver a defenseless people.",
      troparionTone: "Tone 2",
      kontakionText: "Who can declare thy greatness, O virgin disciple?",
      kontakionTone: "Tone 2"
    },
    {
      id: "lit_2025_05_09_revised",
      civilDate: "2025-05-09",
      calendarType: "revised-julian",
      oldStyleDateLabel: "April 26, 2025",
      feastTitle: "Bright Friday",
      feastRank: "bright-week",
      saints: ["Life-Giving Spring of the Theotokos"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 10:44-11:10",
      gospelRef: "John 8:21-30",
      epistleTextKjv: "Can any man forbid water, that these should not be baptized?",
      gospelTextKjv: "When ye have lifted up the Son of man, then shall ye know that I am he.",
      troparionText: "Christ is risen from the dead, trampling down death by death.",
      troparionTone: "Tone 5",
      kontakionText: "Though Thou didst descend into the grave, O Immortal One.",
      kontakionTone: "Tone 8"
    },
    {
      id: "lit_2025_05_10_revised",
      civilDate: "2025-05-10",
      calendarType: "revised-julian",
      oldStyleDateLabel: "April 27, 2025",
      feastTitle: "Apostle Simon the Zealot",
      feastRank: "major",
      saints: ["Apostle Simon the Zealot"],
      fastingRule: "No Fast",
      tone: "Tone 2",
      epistleRef: "Acts 1:12-17, 21-26",
      gospelRef: "John 1:43-51",
      epistleTextKjv: "And the lot fell upon Matthias; and he was numbered with the eleven apostles.",
      gospelTextKjv: "Behold an Israelite indeed, in whom is no guile!",
      troparionText: "O holy Apostle Simon, entreat the merciful God.",
      troparionTone: "Tone 3",
      kontakionText: "With praises let us all bless Simon the apostle.",
      kontakionTone: "Tone 2"
    }
  ]
};

const weeklySummary = {
  lessonsCompleted: 28,
  lessonsPlanned: 34,
  lessonsCompletionPercent: 82,
  narrationsLogged: 16,
  feastDaysAhead: 2,
  nextFeastLabel: "St. John the Theologian (May 8)",
  readAloudProgressPercent: 65,
  readAloudTitle: "The Wingfeather Saga"
};

const dashboardDaily = {
  "2025-05-07": {
    lessonDay: {
      id: "lesson_day_today",
      householdId: learnHousehold.id,
      civilDate: "2025-05-07",
      calendarType: "julian",
      liturgicalDayId: "lit_2025_05_07_julian"
    },
    householdBlocks: [
      {
        id: "household_block_1",
        lessonDayId: "lesson_day_today",
        householdStreamId: "stream_morning_basket",
        status: "completed",
        minutesPlanned: 30,
        title: "Morning Basket",
        subtitle: "Poetry, hymn, picture study, composer, timeline"
      },
      {
        id: "household_block_2",
        lessonDayId: "lesson_day_today",
        householdStreamId: "stream_read_aloud",
        status: "completed",
        minutesPlanned: 20,
        title: "Family Read-Aloud",
        subtitle: "The Wingfeather Saga by Andrew Peterson"
      },
      {
        id: "household_block_3",
        lessonDayId: "lesson_day_today",
        householdStreamId: "stream_nature",
        status: "completed",
        minutesPlanned: 30,
        title: "Nature Study",
        subtitle: "Spring Garden Observations & Sketching"
      },
      {
        id: "household_block_4",
        lessonDayId: "lesson_day_today",
        householdStreamId: "stream_catechesis",
        status: "completed",
        minutesPlanned: 20,
        title: "Catechesis",
        subtitle: "The Creed - Lesson 12 - The Incarnation"
      },
      {
        id: "household_block_5",
        lessonDayId: "lesson_day_today",
        householdStreamId: "stream_feast",
        status: "not-started",
        minutesPlanned: 45,
        title: "Feast Day Activity",
        subtitle: "Pascha Art & Egg Decorating"
      }
    ],
    childColumns: [
      {
        childId: "child_elias",
        blocks: [
          { id: "cb_e_1", lessonDayId: "lesson_day_today", childTrackId: "track_elias_math", status: "completed", minutesPlanned: 35, title: "Math", subtitle: "Lesson 64" },
          { id: "cb_e_2", lessonDayId: "lesson_day_today", childTrackId: "track_elias_narration", status: "completed", minutesPlanned: 15, title: "Written Narration", subtitle: "The Wingfeather Saga" },
          { id: "cb_e_3", lessonDayId: "lesson_day_today", childTrackId: "track_elias_copywork", status: "completed", minutesPlanned: 10, title: "Copywork", subtitle: "Proverbs 3:5-6" },
          { id: "cb_e_4", lessonDayId: "lesson_day_today", childTrackId: "track_elias_reading", status: "completed", minutesPlanned: 20, title: "Independent Reading", subtitle: "The Bronze Bow" },
          { id: "cb_e_5", lessonDayId: "lesson_day_today", childTrackId: "track_elias_nature", status: "not-started", minutesPlanned: 15, title: "Nature Journal", subtitle: "Bird Study" }
        ]
      },
      {
        childId: "child_maria",
        blocks: [
          { id: "cb_m_1", lessonDayId: "lesson_day_today", childTrackId: "track_maria_math", status: "completed", minutesPlanned: 30, title: "Math", subtitle: "Lesson 37" },
          { id: "cb_m_2", lessonDayId: "lesson_day_today", childTrackId: "track_maria_phonics", status: "completed", minutesPlanned: 20, title: "Phonics", subtitle: "Level 3 - Lesson 18" },
          { id: "cb_m_3", lessonDayId: "lesson_day_today", childTrackId: "track_maria_handwriting", status: "completed", minutesPlanned: 10, title: "Handwriting", subtitle: "A Cursive - Page 18" },
          { id: "cb_m_4", lessonDayId: "lesson_day_today", childTrackId: "track_maria_readaloud", status: "completed", minutesPlanned: 20, title: "Read-Aloud Time", subtitle: "Charlotte's Web" },
          { id: "cb_m_5", lessonDayId: "lesson_day_today", childTrackId: "track_maria_picture", status: "not-started", minutesPlanned: 15, title: "Picture Study", subtitle: "Spring Landscapes" }
        ]
      },
      {
        childId: "child_nicholas",
        blocks: [
          { id: "cb_n_1", lessonDayId: "lesson_day_today", childTrackId: "track_nicholas_math", status: "completed", minutesPlanned: 20, title: "Math", subtitle: "Lesson 18" },
          { id: "cb_n_2", lessonDayId: "lesson_day_today", childTrackId: "track_nicholas_phonics", status: "completed", minutesPlanned: 15, title: "Phonics", subtitle: "Level 2 - Lesson 12" },
          { id: "cb_n_3", lessonDayId: "lesson_day_today", childTrackId: "track_nicholas_memory", status: "completed", minutesPlanned: 10, title: "Memory Work", subtitle: "Psalm 23" },
          { id: "cb_n_4", lessonDayId: "lesson_day_today", childTrackId: "track_nicholas_practical", status: "not-started", minutesPlanned: 15, title: "Practical Life", subtitle: "Table Setting" },
          { id: "cb_n_5", lessonDayId: "lesson_day_today", childTrackId: "track_nicholas_art", status: "not-started", minutesPlanned: 20, title: "Art", subtitle: "Watercolor Practice" }
        ]
      },
      {
        childId: "child_anna",
        blocks: [
          { id: "cb_a_1", lessonDayId: "lesson_day_today", childTrackId: "track_anna_poetry", status: "completed", minutesPlanned: 10, title: "Poetry", subtitle: "\"The Skylark\"" },
          { id: "cb_a_2", lessonDayId: "lesson_day_today", childTrackId: "track_anna_picture", status: "completed", minutesPlanned: 10, title: "Picture Talk", subtitle: "Spring Walk" },
          { id: "cb_a_3", lessonDayId: "lesson_day_today", childTrackId: "track_anna_fine_motor", status: "not-started", minutesPlanned: 10, title: "Fine Motor", subtitle: "Bead Stringing" },
          { id: "cb_a_4", lessonDayId: "lesson_day_today", childTrackId: "track_anna_blocks", status: "not-started", minutesPlanned: 15, title: "Blocks", subtitle: "Creative Play" },
          { id: "cb_a_5", lessonDayId: "lesson_day_today", childTrackId: "track_anna_songs", status: "completed", minutesPlanned: 10, title: "Songs", subtitle: "Paschal Hymns" }
        ]
      }
    ],
    churchRhythms: [
      { id: "rhythm_1", lessonDayId: "lesson_day_today", title: "Morning Prayers", status: "completed", note: "Completed" },
      { id: "rhythm_2", lessonDayId: "lesson_day_today", title: "Saint of the Day", status: "completed", note: "Read" },
      { id: "rhythm_3", lessonDayId: "lesson_day_today", title: "Gospel Reading", status: "completed", note: "John 6:56-69" },
      { id: "rhythm_4", lessonDayId: "lesson_day_today", title: "Troparion Practice", status: "completed", note: "Practiced" },
      { id: "rhythm_5", lessonDayId: "lesson_day_today", title: "Wednesday Fast", status: "not-started", note: "Bright Week - No Fast" }
    ],
    thisDayInHistory: {
      label: "This Day in History",
      title: "A conversation starter for the family table",
      year: "Seeded sample",
      summary: "Pair a brief historical note with narration, timeline, or saint study so the dashboard becomes a little more than a checklist.",
      sourceLabel: "AGAPAY Learn sample content"
    },
    googleCalendarSync: {
      connected: false,
      accountLabel: "No Google account connected",
      calendarLabel: "Family school calendar",
      syncScopeLabel: "Feast days, lessons, and read-alouds",
      lastSyncLabel: "Never",
      nextSyncLabel: "After authorization",
      eventsPlanned: 0,
      reminderLabel: "Morning prep reminder",
      description: "Connect Google Calendar to mirror the Learn schedule into a family calendar with lesson blocks and feast days."
    }
  }
};

const narrationLogs = [
  {
    id: "narration_1",
    childId: "child_elias",
    lessonDayId: "lesson_day_today",
    narrationType: "oral",
    sourceTitle: "The Bronze Bow (Ch. 12)",
    note: "Explained why Daniel chose faith over fear.",
    loggedAt: "2025-05-07T16:10:00.000Z"
  },
  {
    id: "narration_2",
    childId: "child_maria",
    lessonDayId: "lesson_day_today",
    narrationType: "written",
    sourceTitle: "Saints of the Day - St. George",
    note: "Wrote about courage and steadfastness.",
    loggedAt: "2025-05-06T14:25:00.000Z"
  },
  {
    id: "narration_3",
    childId: "child_nicholas",
    lessonDayId: "lesson_day_today",
    narrationType: "picture",
    sourceTitle: "Nature Study - Spring Trees",
    note: "Sketched an oak tree after rain.",
    loggedAt: "2025-05-05T11:00:00.000Z"
  }
];

const plannerWeek = {
  id: "planner_week_pascha_3",
  label: "May 4 - May 10, 2025",
  seasonLabel: "Pascha Season",
  dates: ["2025-05-04", "2025-05-05", "2025-05-06", "2025-05-07", "2025-05-08", "2025-05-09", "2025-05-10"],
  householdRows: [
    { id: "week_household_morning", streamId: "stream_morning_basket", title: "Morning Basket", detail: "Poetry, hymn, picture study", priority: 1, minutes: [30, 30, 30, 30, 30, 30, 30], statuses: ["completed", "completed", "completed", "completed", "planned", "planned", "planned"] },
    { id: "week_household_readaloud", streamId: "stream_read_aloud", title: "Family Read-Aloud", detail: "The Wingfeather Saga", priority: 2, minutes: [20, 20, 20, 20, 20, 0, 20], statuses: ["completed", "completed", "completed", "completed", "planned", "deferred", "planned"] },
    { id: "week_household_nature", streamId: "stream_nature", title: "Nature Study", detail: "Spring Garden Observations", priority: 4, minutes: [0, 30, 0, 30, 0, 30, 0], statuses: ["empty", "completed", "empty", "completed", "empty", "reduced", "empty"] },
    { id: "week_household_catechesis", streamId: "stream_catechesis", title: "Catechesis", detail: "The Creed - Lessons 7-12", priority: 1, minutes: [20, 20, 20, 20, 20, 20, 0], statuses: ["completed", "completed", "completed", "completed", "planned", "planned", "empty"] },
    { id: "week_household_feast", streamId: "stream_feast", title: "Feast Day Activity", detail: "Pascha Art & Eggs", priority: 3, minutes: [0, 0, 0, 45, 0, 45, 0], statuses: ["empty", "empty", "empty", "planned", "empty", "planned", "empty"] }
  ],
  childRows: [
    { id: "week_child_elias_math", childId: "child_elias", title: "Math", detail: "Lessons 64-68", priority: 2, minutes: [0, 35, 35, 35, 35, 35, 30], statuses: ["empty", "completed", "completed", "completed", "planned", "reduced", "planned"] },
    { id: "week_child_elias_narration", childId: "child_elias", title: "Written Narration", detail: "The Bronze Bow", priority: 3, minutes: [0, 15, 0, 15, 0, 15, 0], statuses: ["empty", "completed", "empty", "completed", "empty", "deferred", "empty"] },
    { id: "week_child_maria_phonics", childId: "child_maria", title: "Phonics", detail: "Level 3 - L18-22", priority: 2, minutes: [0, 15, 15, 20, 15, 15, 15], statuses: ["empty", "completed", "completed", "completed", "planned", "planned", "planned"] },
    { id: "week_child_nicholas_phonics", childId: "child_nicholas", title: "Phonics", detail: "Level 2 - L12", priority: 2, minutes: [0, 15, 15, 15, 0, 15, 0], statuses: ["empty", "completed", "completed", "completed", "empty", "planned", "empty"] },
    { id: "week_child_anna_little", childId: "child_anna", title: "Little Ones", detail: "Poetry, picture talk, fine motor", priority: 4, minutes: [0, 10, 10, 10, 10, 0, 10], statuses: ["empty", "completed", "completed", "completed", "reduced", "empty", "planned"] }
  ]
};

const termSetup = {
  activeTermId: term.id,
  termOptions: [
    { id: "term_lent", label: "Term 1" },
    { id: "term_pascha", label: "Term 2" },
    { id: "term_pentecost", label: "Term 3" }
  ],
  setupCards: [
    { id: "setup_morning_basket", title: "Morning Basket", value: "30 min", detail: "Hymns, Scripture, poetry, nature timeline" },
    { id: "setup_living_books", title: "Living Books", value: "12 books", detail: "Literature selections and assignments" },
    { id: "setup_picture", title: "Picture Study", value: "4 artists", detail: "Giotto, Fra Angelico, Aivazovsky, Waterhouse" },
    { id: "setup_poet", title: "Poet / Composer", value: "6 poets - 6 comp.", detail: "Poetry and music rotation" },
    { id: "setup_copywork", title: "Copywork", value: "4 days / week", detail: "KJV, hymns, feast texts" },
    { id: "setup_feasts", title: "Feast & Fast", value: "Enabled", detail: "Follow liturgical calendar" },
    { id: "setup_reading", title: "Reading Weeks", value: "Enabled", detail: "Gentle reading week rhythm" },
    { id: "setup_tracks", title: "Tracks", value: "5 children", detail: "Household and child tracks" }
  ],
  pacingRows: [
    { id: "pace_primary_books", label: "Living Books", subtitle: "Primary Read-Aloud", segments: [{ title: "The Wingfeather Saga", start: 1, span: 6 }, { title: "The Bronze Bow", start: 7, span: 6 }] },
    { id: "pace_secondary_books", label: "Living Books", subtitle: "Secondary Read-Aloud", segments: [{ title: "The Wind in the Willows", start: 1, span: 6 }, { title: "Helen of Troy", start: 7, span: 6 }] },
    { id: "pace_catechesis", label: "Catechesis", subtitle: "The Creed", segments: [{ title: "Lessons 1-6: The Incarnation", start: 1, span: 6 }, { title: "Lessons 7-12: The Church", start: 7, span: 6 }] },
    { id: "pace_picture", label: "Picture Study", subtitle: "Artists", segments: [{ title: "Giotto", start: 1, span: 3 }, { title: "Fra Angelico", start: 4, span: 3 }, { title: "Ivan Aivazovsky", start: 7, span: 3 }, { title: "John William Waterhouse", start: 10, span: 3 }] },
    { id: "pace_poetry", label: "Poetry", subtitle: "Poets", segments: [{ title: "Shakespeare", start: 2, span: 3 }, { title: "Longfellow", start: 9, span: 4 }] },
    { id: "pace_composer", label: "Composer", subtitle: "Music", segments: [{ title: "Bach", start: 1, span: 4 }, { title: "Beethoven", start: 5, span: 4 }, { title: "Tchaikovsky", start: 9, span: 4 }] }
  ],
  householdSummary: [
    "Morning Basket: daily",
    "Family Read-Aloud: The Wingfeather Saga",
    "Catechesis: The Creed",
    "Nature Study: spring observations",
    "Timeline & Geography: continued"
  ],
  childTrackSummary: [
    { childId: "child_elias", tracks: ["Math Lesson 64", "Reading: The Bronze Bow", "Composition: Narration"] },
    { childId: "child_maria", tracks: ["Math Lesson 37", "Reading: The Wind in the Willows", "Spelling Level 2"] },
    { childId: "child_nicholas", tracks: ["Math Lesson 18", "Reading: The Tale of Peter Rabbit", "Drawing & Dictation"] },
    { childId: "child_anna", tracks: ["Numbers to 20", "Picture Books", "Pre-reader copywork"] },
    { childId: "child_charlotte", tracks: ["Rhythm & Rhyme", "Picture & Nature", "Short verses"] }
  ],
  termSummary: {
    weeks: 12,
    livingBooks: 28,
    pictureArtists: 4,
    poetsComposers: "6 / 6",
    childrenTracked: 5,
    feastDays: ["St. Thomas Sunday", "St. George the Great Martyr", "Ascension of Our Lord", "Pentecost", "Ss. Peter & Paul"],
    fasts: ["Great Lent close", "Apostles' Fast"]
  }
};

const printTemplates = [
  { id: "print_mom_weekly", householdId: learnHousehold.id, templateType: "weekly-household-plan", title: "Weekly Household Plan", audience: "mom", description: "One-page household stream, feast notes, and child overview." },
  { id: "print_mom_term", householdId: learnHousehold.id, templateType: "term-plan", title: "Term Plan", audience: "mom", description: "12-week pacing, curriculum package, and cycle overview." },
  { id: "print_mom_month", householdId: learnHousehold.id, templateType: "month-calendar", title: "Month Calendar", audience: "mom", description: "School rhythm with feast and fast markers." },
  { id: "print_mom_liturgical", householdId: learnHousehold.id, templateType: "liturgical-school-calendar", title: "Liturgical School Calendar", audience: "mom", description: "School-year view by Orthodox calendar mode." },
  ...children.map((child) => ({ id: `print_${child.id}_weekly`, householdId: learnHousehold.id, templateType: "child-weekly-assignment", title: `${child.firstName}'s Weekly Sheet`, audience: "child", childId: child.id, description: "Daily assignments, readings, memory work, and copywork." })),
  ...children.map((child) => ({ id: `print_${child.id}_term`, householdId: learnHousehold.id, templateType: "child-term-plan", title: `${child.firstName}'s Term Plan`, audience: "child", childId: child.id, description: "Term track summary and reading list." }))
];

const rotations = [
  { id: "rotation_picture_giotto", householdId: learnHousehold.id, termId: term.id, rotationType: "picture-study", title: "Picture Study", currentSelection: "Giotto - The Lamentation", weekRangeLabel: "Weeks 1-3", minutesPerWeek: 20 },
  { id: "rotation_composer_bach", householdId: learnHousehold.id, termId: term.id, rotationType: "composer", title: "Composer", currentSelection: "J. S. Bach", weekRangeLabel: "Weeks 1-4", minutesPerWeek: 15 },
  { id: "rotation_poet_shakespeare", householdId: learnHousehold.id, termId: term.id, rotationType: "poet", title: "Poet", currentSelection: "Shakespeare", weekRangeLabel: "Weeks 1-6", minutesPerWeek: 10 },
  { id: "rotation_nature_spring", householdId: learnHousehold.id, termId: term.id, rotationType: "nature-study", title: "Nature Study", currentSelection: "Spring Garden Observations", weekRangeLabel: "Pascha Term", minutesPerWeek: 45 }
];

const catechesisCycles = [
  {
    id: "catechesis_creed_cycle",
    householdId: learnHousehold.id,
    cycleYearId: cycleYear.id,
    title: "The Creed",
    currentLesson: "Lesson 12 - The Incarnation",
    lessonNumber: 12,
    totalLessons: 36,
    doctrinalTopic: "Christ became man so that we might become partakers of the divine nature.",
    evaluationModel: "narrative-only"
  }
];

const recitationTracks = [
  { id: "recitation_creed", householdId: learnHousehold.id, title: "The Nicene Creed", sourceKind: "creed", progressPercent: 80, status: "memorizing" },
  { id: "recitation_beatitudes", householdId: learnHousehold.id, title: "The Beatitudes", sourceKind: "scripture", progressPercent: 65, status: "memorizing" },
  { id: "recitation_psalm_23", householdId: learnHousehold.id, title: "Psalm 23", sourceKind: "psalm", progressPercent: 50, status: "memorizing" },
  { id: "recitation_lords_prayer", householdId: learnHousehold.id, title: "The Lord's Prayer", sourceKind: "prayer", progressPercent: 100, status: "memorized" }
];

const hymnStudies = [
  { id: "hymn_pascha", householdId: learnHousehold.id, termId: term.id, title: "Christ is Risen from the Dead", tone: "Tone 5", source: "Paschal Hymn", status: "in-progress" },
  { id: "hymn_tone_two", householdId: learnHousehold.id, termId: term.id, title: "Tone 2 Irmos", tone: "Tone 2", source: "Octoechos", status: "planned" }
];

const enrichmentBlocks = [
  { id: "enrich_art_pascha", householdId: learnHousehold.id, termId: term.id, blockType: "art", title: "Watercolor - Pascha Light", minutesPlanned: 15, cadenceLabel: "Weekly" },
  { id: "enrich_nature_spring", householdId: learnHousehold.id, termId: term.id, blockType: "nature-study", title: "Spring Garden", minutesPlanned: 20, cadenceLabel: "2x weekly" },
  { id: "enrich_composer_rach", householdId: learnHousehold.id, termId: term.id, blockType: "composer", title: "Sergei Rachmaninoff", minutesPlanned: 15, cadenceLabel: "Weekly" },
  { id: "enrich_timeline_fathers", householdId: learnHousehold.id, termId: term.id, blockType: "timeline", title: "Early Church Fathers", minutesPlanned: 20, cadenceLabel: "Weekly" }
];

const natureJournalEntries = [
  { id: "nature_entry_elias_oak", childId: "child_elias", observedOn: "2025-05-05", title: "Oak Leaves After Rain", location: "Back garden", notes: "Elias sketched leaf veins and noticed new green tips." },
  { id: "nature_entry_maria_bee", childId: "child_maria", observedOn: "2025-05-06", title: "Bee on Clover", location: "Parish lawn", notes: "Maria drew the clover blossoms and counted six bees." },
  { id: "nature_entry_nicholas_worm", childId: "child_nicholas", observedOn: "2025-05-07", title: "Earthworm Path", location: "Vegetable bed", notes: "Nicholas traced where the soil was loosened after watering." }
];

const orthodoxBookSuggestions = [
  { id: "suggest_saints", title: "Saints' Lives", subtitle: "The Black Christ of St. Sergius; St. Elizabeth the New Martyr", accentToken: "navy" },
  { id: "suggest_history", title: "Church History", subtitle: "The Story of the Church; Tales from Church History", accentToken: "wine" },
  { id: "suggest_feasts", title: "Feast & Seasons", subtitle: "God's Year; The Church Seasons; The Year and Our Children", accentToken: "forest" }
];

const communityResources = [
  {
    id: "community_ancient_faith_kids",
    title: "Ancient Faith Kids",
    category: "Catechesis",
    resourceType: "Website",
    mediaType: "Audio & Activities",
    ageRange: "Family",
    subtitle: "Family-friendly stories, saints, and seasonal listening.",
    url: "https://www.ancientfaith.com/",
    tags: ["Orthodox", "Saints", "Stories", "Audio"],
    sharedBy: "AGAPAY Curated",
    vetted: true
  },
  {
    id: "community_oca_liturgical_resources",
    title: "OCA Liturgical Resources",
    category: "Church Life",
    resourceType: "Reference",
    mediaType: "Articles",
    ageRange: "Family",
    subtitle: "Feast, fast, and daily rhythm materials for home planning.",
    url: "https://www.oca.org/orthodoxy",
    tags: ["Feasts", "Fasts", "Saints", "Calendar"],
    sharedBy: "AGAPAY Curated",
    vetted: true
  },
  {
    id: "community_goarch_family",
    title: "GOARCH Family Resources",
    category: "Catechesis",
    resourceType: "Website",
    mediaType: "Lessons & Activities",
    ageRange: "Family",
    subtitle: "Home prayer, feast days, and Orthodox family formation.",
    url: "https://www.goarch.org/",
    tags: ["Prayer", "Family", "Feasts", "Formation"],
    sharedBy: "AGAPAY Curated",
    vetted: true
  },
  {
    id: "community_orthodox_wiki",
    title: "Orthodox Wiki",
    category: "Research",
    resourceType: "Reference",
    mediaType: "Articles",
    ageRange: "Upper Forms",
    subtitle: "Quick saint, feast, and history references for older students.",
    url: "https://www.orthodoxwiki.org/",
    tags: ["Church History", "Saints", "Research", "Reference"],
    sharedBy: "AGAPAY Curated",
    vetted: true
  },
  {
    id: "community_faith_and_life",
    title: "OCA Lives of the Saints",
    category: "Church Life",
    resourceType: "Reading",
    mediaType: "Articles",
    ageRange: "Family",
    subtitle: "Daily saint biographies for family reading, narration, and century books.",
    url: "https://www.oca.org/saints/lives",
    tags: ["Saints", "Biography", "Narration", "Century Book"],
    sharedBy: "AGAPAY Curated",
    vetted: true
  }
];

const libraryBooks = [
  { id: "library_lives_saints", title: "The Lives of the Saints (4 Vol. Set)", author: "Fr. Alban Butler", category: "Saints' Lives", ageRange: "8+", orthodox: true, assignmentLabel: "Year Round", progressPercent: 78 },
  { id: "library_story_wise_man", title: "The Story of the Other Wise Man", author: "Henry Van Dyke", category: "Saints' Lives", ageRange: "8-12", orthodox: true, assignmentLabel: "Advent Term", progressPercent: 60 },
  { id: "library_new_testament", title: "The World of the New Testament", author: "M. B. Synge", category: "Scripture History", ageRange: "9-14", orthodox: true, assignmentLabel: "Lent Term", progressPercent: 45 },
  { id: "library_greek_folk", title: "Old Greek Folk Stories", author: "James Baldwin", category: "Myths & Tales", ageRange: "8-12", orthodox: false, assignmentLabel: "Spring Term", progressPercent: 30 },
  { id: "library_little_pilgrim", title: "Little Pilgrim's Progress", author: "Helen L. Taylor", category: "Classics", ageRange: "7+", orthodox: true, assignmentLabel: "Spring Term", progressPercent: 20 },
  { id: "library_childrens_year", title: "The Children's Year", author: "Jane B. Herrick", category: "Feast & Seasons", ageRange: "5-10", orthodox: true, assignmentLabel: "Year Round", progressPercent: 15 },
  { id: "library_church_history", title: "Tales from Church History", author: "A. C. McGiffert", category: "Church History", ageRange: "9-14", orthodox: true, assignmentLabel: "Summer Term", progressPercent: 10 },
  { id: "library_anne_green_gables", title: "Anne of Green Gables", author: "L. M. Montgomery", category: "Classics", ageRange: "9+", orthodox: false, assignmentLabel: "Summer Term", progressPercent: 0 }
];

const currentReadAlouds = [
  { bookId: "book_wingfeather", title: "The Wingfeather Saga Book 1: On the Edge of the Dark Sea of Darkness", author: "Andrew Peterson", assignmentLabel: "Spring Term", progressPercent: 65, streamLabel: "Household Stream", listLabel: "Morning Basket" },
  { bookId: "book_st_nicholas", title: "Saint Nicholas: The Real Story of the Christmas Legend", author: "Barbara Yoffie", assignmentLabel: "Advent Term", progressPercent: 40, streamLabel: "Household Stream", listLabel: "Morning Basket" },
  { bookId: "book_swiss_family", title: "The Swiss Family Robinson", author: "Johann David Wyss", assignmentLabel: "Spring Term", progressPercent: 25, streamLabel: "Household Stream", listLabel: "Morning Basket" }
];

const academicRecords = [
  { id: "record_elias_history", householdId: learnHousehold.id, childId: "child_elias", schoolYearId: schoolYear.id, subject: "History", evaluationModel: "narrative-only", mark: "Complete", narrativeSummary: "Narrated the early Church readings with steady attention and made clear connections to Acts." },
  { id: "record_elias_math", householdId: learnHousehold.id, childId: "child_elias", schoolYearId: schoolYear.id, subject: "Math", evaluationModel: "percent", mark: "82%", narrativeSummary: "Completed lessons 64-68 with improved mental arithmetic." },
  { id: "record_maria_phonics", householdId: learnHousehold.id, childId: "child_maria", schoolYearId: schoolYear.id, subject: "Phonics", evaluationModel: "complete-incomplete", mark: "Complete", narrativeSummary: "Read Level 3 passages aloud with growing confidence." },
  { id: "record_nicholas_nature", householdId: learnHousehold.id, childId: "child_nicholas", schoolYearId: schoolYear.id, subject: "Nature Study", evaluationModel: "narrative-only", mark: "Complete", narrativeSummary: "Observed spring trees and completed three picture narrations." }
];

const reportCards = [
  { id: "report_card_elias_pascha", householdId: learnHousehold.id, childId: "child_elias", schoolYearId: schoolYear.id, termId: term.id, status: "ready", generatedAt: nowIso, summary: "Elias is completing a strong Pascha term with faithful narrations and steady math work.", records: academicRecords.filter((record) => record.childId === "child_elias") },
  { id: "report_card_maria_pascha", householdId: learnHousehold.id, childId: "child_maria", schoolYearId: schoolYear.id, termId: term.id, status: "draft", summary: "Maria's report card is ready for parent notes.", records: academicRecords.filter((record) => record.childId === "child_maria") }
];

const transcripts = [
  { id: "transcript_elias_lower", householdId: learnHousehold.id, childId: "child_elias", status: "ready", generatedAt: nowIso, gradeSpan: "Grades 1-4", credits: 0, records: academicRecords.filter((record) => record.childId === "child_elias") }
];

const reportExports = [
  { id: "export_attendance_pdf", householdId: learnHousehold.id, exportType: "attendance", format: "pdf", status: "ready", generatedAt: nowIso },
  { id: "export_lesson_log_csv", householdId: learnHousehold.id, exportType: "lesson-log", format: "csv", status: "ready", generatedAt: nowIso },
  { id: "export_curriculum_pdf", householdId: learnHousehold.id, exportType: "curriculum-list", format: "pdf", status: "ready", generatedAt: nowIso },
  { id: "export_narration_pdf", householdId: learnHousehold.id, exportType: "narration-log", format: "pdf", status: "ready", generatedAt: nowIso }
];

const coOp = {
  id: "coop_st_catherine",
  name: "St. Catherine Homeschool Co-op",
  city: "Charlotte, North Carolina",
  affiliation: "Orthodox - Classical - Community",
  learningCycleLabel: "Cycle 2 - Week 3",
  enabled: true
};

const coOpMembers = [
  { id: "coop_member_martin", coOpId: coOp.id, householdName: "The Martin Family", childrenCount: 5, role: "lead" },
  { id: "coop_member_wingfeather", coOpId: coOp.id, householdName: "The Wingfeather Family", childrenCount: 3, role: "member" },
  { id: "coop_member_anderson", coOpId: coOp.id, householdName: "The Anderson Family", childrenCount: 4, role: "teacher" },
  { id: "coop_member_theodore", coOpId: coOp.id, householdName: "The Theodore Family", childrenCount: 6, role: "teacher" },
  { id: "coop_member_stjohn", coOpId: coOp.id, householdName: "The St. John Family", childrenCount: 3, role: "member" },
  { id: "coop_member_benjamin", coOpId: coOp.id, householdName: "The Benjamin Family", childrenCount: 2, role: "member" }
];

const coOpMeeting = {
  id: "coop_meeting_2025_05_14",
  coOpId: coOp.id,
  startsAt: "2025-05-14T09:00:00.000-04:00",
  endsAt: "2025-05-14T12:30:00.000-04:00",
  locationLabel: "St. Catherine Parish Hall"
};

const coOpScheduleBlocks = [
  { id: "coop_block_morning", meetingId: coOpMeeting.id, title: "Shared Morning Basket", subtitle: "Hymn - Poetry - Picture - Story - Prayer", startsAt: "9:00 AM", endsAt: "9:20 AM", teacherHouseholdName: "The Martin Family" },
  { id: "coop_block_nature", meetingId: coOpMeeting.id, title: "Nature Study", subtitle: "Local flora and fauna observation", startsAt: "9:20 AM", endsAt: "10:00 AM", teacherHouseholdName: "The Wingfeather Family" },
  { id: "coop_block_handicrafts", meetingId: coOpMeeting.id, title: "Handicrafts", subtitle: "Embroidery and simple stitches", startsAt: "10:15 AM", endsAt: "11:00 AM", teacherHouseholdName: "The Anderson Family" },
  { id: "coop_block_picture", meetingId: coOpMeeting.id, title: "Picture Study", subtitle: "The Transfiguration - Raphael", startsAt: "11:00 AM", endsAt: "11:45 AM", teacherHouseholdName: "The Theodore Family" },
  { id: "coop_block_catechesis", meetingId: coOpMeeting.id, title: "Catechesis", subtitle: "The Creed - Lesson 12", startsAt: "11:45 AM", endsAt: "12:15 PM", teacherHouseholdName: "The St. John Family" }
];

const coOpAnnouncements = [
  { id: "coop_announce_potluck", coOpId: coOp.id, title: "Feast Potluck", body: "Please join us for our spring feast potluck on May 21 after co-op.", postedAt: "2025-05-08T10:00:00.000Z", priority: "important" },
  { id: "coop_announce_field_trip", coOpId: coOp.id, title: "Field Trip Reminder", body: "Botanical Gardens field trip forms are due by May 16.", postedAt: "2025-05-06T13:30:00.000Z", priority: "normal" },
  { id: "coop_announce_schedule", coOpId: coOp.id, title: "Feast Day Schedule", body: "We will meet on Thursday, May 29 for the Ascension of our Lord.", postedAt: "2025-05-05T09:00:00.000Z", priority: "normal" }
];

const onboarding = {
  household: { currentStep: 4, totalSteps: 6, completedSteps: ["Household", "Children", "Calendar"], nextStep: "Books & Streams" },
  steps: [
    { id: "setup_household", title: "Household", status: "complete", summary: "Family profile, parish, and method selected." },
    { id: "setup_children", title: "Children", status: "complete", summary: "Five children added with age and grade bands." },
    { id: "setup_calendar", title: "Church Calendar", status: "complete", summary: "Julian calendar selected with Revised Julian preview available." },
    { id: "setup_books", title: "Books & Streams", status: "active", summary: "Choose read-alouds, morning basket, and family streams." },
    { id: "setup_records", title: "Records", status: "upcoming", summary: "Set evaluation models and report export defaults." },
    { id: "setup_coop", title: "Co-op", status: "upcoming", summary: "Optionally connect a feature-flagged community." }
  ],
  preferences: {
    calendarType: "julian",
    evaluationModel: "narrative-only",
    graceModeDefault: "light",
    printPack: "weekly household and child sheets"
  }
};

const placeholderRecords = {
  printTemplates,
  printJobs: [],
  reportCards,
  transcripts,
  academicRecords
};

function clone(value) {
  return structuredClone(value);
}

export function getLearnSeedSnapshot() {
  return clone({
    generatedAt: nowIso,
    household: learnHousehold,
    children,
    schoolYear,
    term,
    cycleFramework,
    cycleYear,
    cycleTopics,
    curriculumPackage,
    curriculumPackages,
    curriculumSubjects,
    curriculumResources,
    curriculumMappings,
    paceProfile,
    seasonAdjustment,
    graceModeRule,
    householdStreams,
    childTracks,
    books,
    bookAssignments,
    liturgicalWeek,
    weeklySummary,
    plannerWeek,
    termSetup,
    dashboardDaily,
    narrationLogs,
    rotations,
    catechesisCycles,
    recitationTracks,
    hymnStudies,
    enrichmentBlocks,
    natureJournalEntries,
    orthodoxBookSuggestions,
    communityResources,
    libraryBooks,
    currentReadAlouds,
    academicRecords,
    reportCards,
    transcripts,
    reportExports,
    coOp,
    coOpMembers,
    coOpMeeting,
    coOpScheduleBlocks,
    coOpAnnouncements,
    onboarding,
    placeholderRecords
  });
}
