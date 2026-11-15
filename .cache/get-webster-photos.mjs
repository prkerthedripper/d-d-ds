const titles = [
  'File:WaterfrontArtFestival2018ExhibitorsEastSide.jpg',
  'File:WaterfrontArtFestival2018ExhibitorsFromAcrossThePond.jpg',
  'File:NY104 East - Hard Road Holt Road - Button Copy (42054148554).jpg',
  'File:NY104 East - Five Mile Line Road (41870969035).jpg',
  'File:Webster - Bank Building.jpg',
  'File:Webster, New York town hall.jpg',
  'File:Webster, New York village hall.jpg',
  'File:Road - panoramio (55).jpg',
  'File:DevilsCoveViewedFromGlenEdith.JPG',
  'File:StonyPointViewedFromLakeRoad.JPG',
  'File:SubmergedTreesIrondequoitBay.jpg',
  'File:EdwardWSpryMiddleSchoolWebsterNewYork.jpg',
  'File:NYSRoute250WebsterWebsterBaptistChurch.jpg',
  'File:AbrahamLincolnParkViewedFromIrondequoitBayParkWest.JPG',
  'File:NY104 East - Bay Road - Irondequoit (42054148084).jpg',
];

const params = new URLSearchParams({
  action: 'query',
  titles: titles.join('|'),
  prop: 'imageinfo|coordinates',
  iiprop: 'url|size|extmetadata',
  iiurlwidth: '1600',
  format: 'json',
  origin: '*',
});
const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
  headers: { 'User-Agent': 'DnD-DS/1.0 (local campaign asset setup)' },
});
if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
const data = await response.json();
const strip = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
for (const page of Object.values(data.query?.pages || {})) {
  const info = page.imageinfo?.[0];
  const meta = info?.extmetadata || {};
  console.log(JSON.stringify({
    title: page.title,
    missing: page.missing !== undefined,
    description: strip(meta.ImageDescription?.value).slice(0, 300),
    artist: strip(meta.Artist?.value),
    license: strip(meta.LicenseShortName?.value),
    licenseUrl: meta.LicenseUrl?.value || '',
    credit: strip(meta.Credit?.value),
    date: strip(meta.DateTimeOriginal?.value || meta.DateTime?.value),
    gps: meta.GPSLatitude?.value && meta.GPSLongitude?.value ? `${meta.GPSLatitude.value},${meta.GPSLongitude.value}` : '',
    width: info?.width,
    height: info?.height,
    thumb: info?.thumburl || '',
    file: info?.url || '',
    page: info?.descriptionurl || '',
  }, null, 2));
}
