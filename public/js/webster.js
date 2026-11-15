// Verified Webster, New York photographs used by the world and location editor.
// Every file is stored locally under /assets/webster; source and licence details
// are repeated in /assets/webster/CREDITS.md. Do not relabel these as other places.
export const WEBSTER_PHOTOS = [
  {
    slug: 'north-ponds-festival-west',
    file: '/assets/webster/north-ponds-festival-west.webp',
    title: 'Waterfront Art Festival at North Ponds Park',
    place: 'North Ponds Park · Webster, NY',
    tags: ['park', 'water', 'community'],
    note: 'The 2018 Waterfront Art Festival, held at North Ponds Park. The photo is geotagged inside the park.',
    credit: 'DanielPenfield',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:WaterfrontArtFestival2018ExhibitorsFromAcrossThePond.jpg',
  },
  {
    slug: 'north-ponds-festival-east',
    file: '/assets/webster/north-ponds-festival-east.webp',
    title: 'North Ponds Park during the Waterfront Art Festival',
    place: 'North Ponds Park · Webster, NY',
    tags: ['park', 'community'],
    note: 'Exhibitors on the east side of the 2018 Waterfront Art Festival at North Ponds Park.',
    credit: 'DanielPenfield',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:WaterfrontArtFestival2018ExhibitorsEastSide.jpg',
  },
  {
    slug: 'ny104-holt-road',
    file: '/assets/webster/ny104-holt-road.webp',
    title: 'NY 104 at Holt Road',
    place: 'Route 104 corridor · Webster, NY',
    tags: ['road', 'commercial'],
    note: 'Button-copy signage on NY 104 near the Holt Road interchange, a short walk south of the park.',
    credit: 'formulanone',
    license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:NY104_East_-_Hard_Road_Holt_Road_-_Button_Copy_(42054148554).jpg',
  },
  {
    slug: 'ny104-five-mile-line',
    file: '/assets/webster/ny104-five-mile-line.webp',
    title: 'NY 104 at Five Mile Line Road',
    place: 'Route 104 corridor · Webster, NY',
    tags: ['road', 'commercial'],
    note: 'The Route 104 commercial corridor east of the park, with the intersection and service-road character of the area.',
    credit: 'formulanone',
    license: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:NY104_East_-_Five_Mile_Line_Road_(41870969035).jpg',
  },
  {
    slug: 'webster-bank-building',
    file: '/assets/webster/webster-bank-building.webp',
    title: 'Jayne and Mason Bank Building',
    place: 'Village of Webster · Webster, NY',
    tags: ['village', 'shops'],
    note: 'The 1906 bank building on Route 404 in the village center, now home to a second-hand shop.',
    credit: 'Matthew D. Wilson (LtPowers)',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Webster_-_Bank_Building.jpg',
  },
  {
    slug: 'webster-village-hall',
    file: '/assets/webster/webster-village-hall.webp',
    title: 'Webster Village Hall',
    place: 'Village of Webster · Webster, NY',
    tags: ['village', 'civic'],
    note: 'The Village of Webster municipal hall.',
    credit: 'DanielPenfield',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Webster,_New_York_village_hall.jpg',
  },
];

export const WEBSTER_PHOTO_BY_FILE = new Map(WEBSTER_PHOTOS.map((photo) => [photo.file, photo]));
export const NORTH_PONDS_HERO = '/assets/webster/north-ponds-aerial.webp';
export const NORTH_PONDS_PARK_PHOTO = '/assets/webster/north-ponds-festival-west.webp';

export function photoForFile(file) {
  return WEBSTER_PHOTO_BY_FILE.get(file) || null;
}
