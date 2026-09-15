/**
 * Species screen CONTENT only. The chrome around it belongs to AppShell.
 *
 * "Aina ya samaki" throughout, matching the label on Production's cycle form -
 * the thing registered here is the thing that fills that dropdown, and it must
 * not change name between the two screens.
 *
 * THE GROWTH MONTHS ARE THE POINT, and the copy says so rather than leaving it
 * to be inferred from a number box. That single number is what computes
 * `expectedHarvestDate` for every cycle of the species, which is why the hint
 * says half-months are allowed - somebody who assumes whole months only will
 * round 6.5 to 7 themselves and move every predicted harvest by a fortnight.
 *
 * `errorNameTaken` is OUR copy, not the backend's, for a reason the feed
 * catalogue does not share: the backend's sentence here IS specific ("Aina ya
 * samaki yenye jina hili tayari ipo"), but it does not mention the part that
 * confuses people - a species that was DELETED still holds its name, because
 * the row is still there and `species.name` is UNIQUE. So the screen says the
 * thing the backend leaves out.
 *
 * The >0 and range refusals keep the BACKEND'S sentence, the opposite choice
 * and for the opposite reason: each one names the field and the exact limit
 * ("haiwezi kuzidi 999.9"), which is more than any generic line written here
 * could carry.
 */
export const SPECIES_I18N = {
  sw: {
    title: 'Aina za Samaki',
    subtitle: 'Katalogi ya aina zinazopatikana kwa mashamba yote, na muda wake wa kukua',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    colNumber: 'S/No',
    colName: 'Aina ya samaki',
    colGrowthMonths: 'Wastani wa miezi ya kukua',
    colHarvestWeight: 'Wastani wa uzito wa mavuno (kg)',
    /** Kiambishi cha miezi kwenye safu: "miezi 6.5". */
    monthsUnit: 'miezi',

    emptyTitle: 'Hakuna aina ya samaki bado',
    emptyMessage:
      'Sajili aina ya kwanza hapa chini. Hadi ifanyike, hakuna aina ya kuchagua wakati wa kuanzisha mzunguko.',

    listTitle: 'Aina zilizosajiliwa',
    // Rail ya muhtasari. Hakuna kalenda: katalogi hii haina tarehe wala
    // farm_id, hivyo "ilikuwaje Machi" halina jibu.
    introTitle: 'Aina za Samaki',
    introBody: 'Katalogi ya mfumo mzima: kila shamba linachota hapa wakati wa kuanzisha mzunguko.',
    introStep1: 'Sajili aina - jina, miezi ya kukua, na uzito wa wastani wa mavuno.',
    introStep2: 'Miezi ya kukua ndiyo inayokokotoa tarehe ya mavuno ya kila mzunguko.',
    introStep3: 'Aina haifutwi wala kuhaririwa - iliyokosewa inasajiliwa upya kwa jina sahihi.',
    railTitle: 'Muhtasari wa katalogi',
    railTotal: 'Aina zote',
    railAvgGrowth: 'Wastani wa miezi ya kukua',
    railAvgWeight: 'Wastani wa uzito (kg)',
    railQuickestTitle: 'Inayokua haraka zaidi',
    railQuickestHint: 'Miezi ya kukua - ndiyo inayoamua tarehe ya mavuno.',
    dash: '—',

    formTitle: 'Sajili aina ya samaki',
    formHint: 'Katalogi ni ya mfumo mzima: aina utakayosajili itaonekana kwa kila shamba.',
    fieldName: 'Jina la aina',
    fieldNameHint: 'Mfano: Sato',
    fieldGrowthMonths: 'Wastani wa miezi ya kukua',
    fieldHarvestWeight: 'Wastani wa uzito wa mavuno (kg)',
    growthHint:
      'Nusu-mwezi inakubalika: andika 6.5 ikiwa ndivyo ilivyo. Namba hii ndiyo inayokokotoa tarehe ya mavuno inayotarajiwa ya kila mzunguko wa aina hii.',
    submit: 'Sajili',

    errorNameRequired: 'Andika jina la aina ya samaki.',
    errorNameTooLong: 'Jina lisizidi herufi 80.',
    errorNameTaken:
      'Jina hili limechukuliwa. Hata aina iliyofutwa inabaki na jina lake - chagua jina jingine.',
    errorGrowthRequired: 'Andika wastani wa miezi ya kukua.',
    errorGrowthPositive: 'Miezi ya kukua lazima iwe zaidi ya sifuri.',
    errorWeightRequired: 'Andika wastani wa uzito wa mavuno.',
    errorWeightPositive: 'Uzito wa mavuno lazima uwe zaidi ya sifuri.',

    createdToast: 'Aina ya samaki imesajiliwa.',
    close: 'Funga',
  },
  en: {
    title: 'Fish Species',
    subtitle: 'The species every farm can draw from, and how long each takes to grow',
    loading: 'Loading...',
    retry: 'Try again',

    colNumber: 'S/No',
    colName: 'Species',
    colGrowthMonths: 'Average months to harvest',
    colHarvestWeight: 'Average harvest weight (kg)',
    /** Prefix for the months column: "months 6.5". */
    monthsUnit: 'months',

    emptyTitle: 'No species yet',
    emptyMessage:
      'Register the first one below. Until you do, there is nothing to choose from when starting a cycle.',

    listTitle: 'Registered species',
    introTitle: 'Fish Species',
    introBody: 'A system-wide catalogue: every farm draws from it when starting a cycle.',
    introStep1: 'Register a species - name, months to grow, average harvest weight.',
    introStep2: 'The months to grow is what computes every cycle expected harvest date.',
    introStep3: 'A species is never edited or deleted - a wrong one is registered again correctly.',
    railTitle: 'Catalogue summary',
    railTotal: 'All species',
    railAvgGrowth: 'Average months to grow',
    railAvgWeight: 'Average weight (kg)',
    railQuickestTitle: 'Quickest to grow',
    railQuickestHint: 'Months to grow - what sets the harvest date.',
    dash: '—',

    formTitle: 'Register a species',
    formHint: 'The catalogue is system-wide: what you register here appears on every farm.',
    fieldName: 'Species name',
    fieldNameHint: 'For example: Tilapia',
    fieldGrowthMonths: 'Average months to harvest',
    fieldHarvestWeight: 'Average harvest weight (kg)',
    growthHint:
      'Half-months are allowed: enter 6.5 if that is what it is. This number is what computes the expected harvest date of every cycle of this species.',
    submit: 'Register',

    errorNameRequired: 'Enter a name for the species.',
    errorNameTooLong: 'The name must be 80 characters or fewer.',
    errorNameTaken:
      'That name is taken. Even a deleted species keeps its name - choose a different one.',
    errorGrowthRequired: 'Enter the average months to harvest.',
    errorGrowthPositive: 'Months to harvest must be above zero.',
    errorWeightRequired: 'Enter the average harvest weight.',
    errorWeightPositive: 'Harvest weight must be above zero.',

    createdToast: 'Species registered.',
    close: 'Close',
  },
} as const;
