export const WATER_QUALITY_I18N = {
  sw: {
    title: 'Ubora wa Maji',
    subtitle: 'Vipimo vya maji kwa mzunguko uliochaguliwa',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    noCycleTitle: 'Hujachagua mzunguko',
    noCycleMessage:
      'Vipimo vya maji ni vya mzunguko mmoja. Nenda kwenye Uzalishaji, chagua mzunguko, kisha urudi hapa.',
    goToProduction: 'Nenda kwenye Uzalishaji',

    contextLabel: 'Unarekodi kwa',
    contextUnit: 'Kitengo',

    formTitle: 'Rekodi kipimo',
    formHint:
      'Jaza vipimo ulivyonavyo; vingine viache wazi. Thamani mbaya SI kosa - ndiyo sababu ya kupima.',
    fieldPh: 'pH',
    fieldTemperature: 'Joto (°C)',
    fieldOxygen: 'Oksijeni - DO (mg/L)',
    fieldAmmonia: 'Amonia (mg/L)',
    fieldNotes: 'Maelezo',
    optional: 'Si lazima',
    submit: 'Hifadhi kipimo',
    errorNothingEntered: 'Jaza angalau kipimo kimoja.',
    savedToast: 'Kipimo kimehifadhiwa.',

    listTitle: 'Vipimo vya karibuni',
    colNumber: 'S/No',
    colDate: 'Tarehe',
    colUnit: 'Kitengo',
    colPh: 'pH',
    colTemperature: 'Joto',
    colOxygen: 'DO',
    colAmmonia: 'Amonia',
    colRecordedBy: 'Amerekodi',
    colNotes: 'Maelezo',
    blank: '—',
    listEmptyTitle: 'Hakuna kipimo bado',
    listEmptyMessage: 'Kipimo cha kwanza cha mzunguko huu kitaonekana hapa.',
  },
  en: {
    title: 'Water Quality',
    subtitle: 'Water readings for the selected cycle',
    loading: 'Loading...',
    retry: 'Try again',

    noCycleTitle: 'No cycle selected',
    noCycleMessage:
      'A water reading belongs to one cycle. Go to Production, pick a cycle, then come back here.',
    goToProduction: 'Go to Production',

    contextLabel: 'Recording for',
    contextUnit: 'Unit',

    formTitle: 'Record a reading',
    formHint:
      'Fill in the measurements you have and leave the rest blank. A bad reading is NOT an error - it is why you measure.',
    fieldPh: 'pH',
    fieldTemperature: 'Temperature (°C)',
    fieldOxygen: 'Oxygen - DO (mg/L)',
    fieldAmmonia: 'Ammonia (mg/L)',
    fieldNotes: 'Notes',
    optional: 'Optional',
    submit: 'Save reading',
    errorNothingEntered: 'Enter at least one measurement.',
    savedToast: 'Reading saved.',

    listTitle: 'Recent readings',
    colNumber: 'S/No',
    colDate: 'Date',
    colUnit: 'Unit',
    colPh: 'pH',
    colTemperature: 'Temp',
    colOxygen: 'DO',
    colAmmonia: 'Ammonia',
    colRecordedBy: 'Recorded by',
    colNotes: 'Notes',
    blank: '—',
    listEmptyTitle: 'No readings yet',
    listEmptyMessage: 'The first reading for this cycle will appear here.',
  },
} as const;
