import fs from 'node:fs';
import path from 'node:path';

const BASE_LAT = 53.47985;
const BASE_LNG = -2.25105;

// Haversine distance in miles
function haversineMiles(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const toRad = x => (x * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

// Walking time in minutes based on Manchester city grid (approx 19.5 min/mile + 1 min for crossings)
function calcWalkTime(miles) {
  if (!miles || miles <= 0) return 1;
  const time = Math.round(miles * 19.5 + (miles > 0.5 ? 2 : 1));
  return Math.max(1, time);
}

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}


const rawCsv = `Club status,Venue (as supplied),Latitude (WGS84),Longitude (WGS84),Coordinates status,Location precision,Branch review required,Located address,Evidence / source URL,Address verification URL,Map search link,Notes
Approved,Crazy Pedro’s,53.48127,-2.24983,Exact venue POI,Mapped venue POI (approximately 5–15 m),No,"55–57 Bridge Street, M3 3BQ",https://mapcarta.com/N4302638089,https://mapcarta.com/N4302638089,https://www.google.com/maps/search/?api=1&query=53.481270%2C-2.249830,"Bridge Street branch selected (also at 1 Short Street, 53.48251, -2.23651)."
Approved,Fazenda “Fogo de Chão“,53.48033,-2.25074,Venue-level external map coordinate; check Google Maps pin,Venue map coordinate (check exact pin),No,"The Avenue, Spinningfields, M3 3AP",https://aroundus.com/p/171791486-fazenda,https://aroundus.com/p/171791486-fazenda,https://www.google.com/maps/search/?api=1&query=53.480330%2C-2.250740,Renamed Fogo de Chão; unchanged location. Venue-level map listing; same location after rebrand.
Approved,Flat Iron,53.47845,-2.24969,Exact venue POI,Mapped venue POI (approximately 5–15 m),No,"200 Deansgate, M3 3NN",https://mapcarta.com/N324691503,https://mapcarta.com/N324691503,https://www.google.com/maps/search/?api=1&query=53.478450%2C-2.249690,
Approved,Street Guys (Street Star),53.48143,-2.24946,Exact venue POI,Mapped venue POI (approximately 5–15 m),No,"6–7 Butter Lane, M3 2PD",https://mapcarta.com/N10844573071,https://mapcarta.com/N10844573071,https://www.google.com/maps/search/?api=1&query=53.481430%2C-2.249460,Business listing is Street Guys; Street Star alias unconfirmed.
Approved,Wok to Walk,53.482225,-2.246756,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"61 Deansgate, M3 2BW",https://www.doogal.co.uk/ShowMap?postcode=M3%202BW,https://www.doogal.co.uk/ShowMap?postcode=M3%202BW,https://www.google.com/maps/search/?api=1&query=53.482225%2C-2.246756,
Approved,Wright's Fish & Chips,53.48041,-2.24522,Exact venue POI,Mapped venue POI (approximately 5–15 m),No,"86 Cross Street, M2 4LA",https://mapcarta.com/N9608497683,https://mapcarta.com/N9608497683,https://www.google.com/maps/search/?api=1&query=53.480410%2C-2.245220,
Approved,Lakeland Grocers in the City,53.47423,-2.25145,Exact venue POI (OpenStreetMap / mapped venue),Mapped venue POI (approximately 5–15 m),No,"345 Deansgate, M3 4LG",https://mapcarta.com/N1898424429,https://mapcarta.com/N1898424429,https://www.google.com/maps/search/?api=1&query=53.474230%2C-2.251450,
Approved,Mick Hucknall’s Rustik Bites,53.473839,-2.251288,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"343 Deansgate, M3 4LG",https://www.doogal.co.uk/ShowMap?postcode=M3%204LG,https://www.doogal.co.uk/ShowMap?postcode=M3%204LG,https://www.google.com/maps/search/?api=1&query=53.473839%2C-2.251288,
Approved,New Wave Ramen,53.48043,-2.24434,Exact venue POI,Mapped venue POI (approximately 5–15 m),No,"16 Tib Lane, M2 4JB",https://mapcarta.com/N9604296155,https://mapcarta.com/N9604296155,https://www.google.com/maps/search/?api=1&query=53.480430%2C-2.244340,
Approved,Double Zero,53.480187,-2.241139,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"55 Spring Gardens, M2 2BY",https://www.doogal.co.uk/ShowMap?postcode=M2%202BY,https://www.doogal.co.uk/ShowMap?postcode=M2%202BY,https://www.google.com/maps/search/?api=1&query=53.480187%2C-2.241139,
Approved,Fat Pat’s,53.47782,-2.24016,Venue-level external map coordinate; check Google Maps pin,Venue map coordinate (check exact pin),No,"88 Portland Street, M1 4GX",https://findit.city/en/uk/manchester/places/restaurants/fat-pats-11114941944,https://findit.city/en/uk/manchester/places/restaurants/fat-pats-11114941944,https://www.google.com/maps/search/?api=1&query=53.477820%2C-2.240160,"88 Portland Street venue point, not the Dark Lane kitchen."
Approved,Happy Seasons,53.47806,-2.24013,Exact venue POI,Mapped venue POI (approximately 5–15 m),No,"59 Faulkner Street, M1 4FF",https://mapcarta.com/N2692887693,https://mapcarta.com/N2692887693,https://www.google.com/maps/search/?api=1&query=53.478060%2C-2.240130,
Approved,Listos Burrito,53.475279,-2.241443,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"91–93 Oxford Street, M1 6ET",https://www.doogal.co.uk/ShowMap?postcode=M1%206ET,https://www.doogal.co.uk/ShowMap?postcode=M1%206ET,https://www.google.com/maps/search/?api=1&query=53.475279%2C-2.241443,Listings use Listo Burrito (singular).
Approved,Lottie’s Bakehouse,53.479326,-2.2402,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Basement, 10 Charlotte House, Charlotte Street, Manchester M1 4FL",https://www.doogal.co.uk/ShowMap?postcode=M1%204FL,https://lottiesbakehouse.uk/,https://www.google.com/maps/search/?api=1&query=53.479326%2C-2.240200,
Approved,That Ziki,53.475279,-2.241443,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"95 Oxford Street, M1 6ET",https://www.doogal.co.uk/ShowMap?postcode=M1%206ET,https://www.doogal.co.uk/ShowMap?postcode=M1%206ET,https://www.google.com/maps/search/?api=1&query=53.475279%2C-2.241443,
Approved,Bunny Jacksons,53.473193,-2.245996,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"1 Jack Rosenthal Street, M15 4RA",https://www.doogal.co.uk/ShowMap?postcode=M15%204RA,https://www.doogal.co.uk/ShowMap?postcode=M15%204RA,https://www.google.com/maps/search/?api=1&query=53.473193%2C-2.245996,
Approved,Bird of Prey,53.47348,-2.23912,Exact venue POI (OpenStreetMap / mapped venue),Mapped venue POI (approximately 5–15 m),No,"49A Charles Street, M1 7DF",https://mapcarta.com/N9764825294,https://mapcarta.com/N9764825294,https://www.google.com/maps/search/?api=1&query=53.473480%2C-2.239120,
Approved,Burgerism,53.48033,-2.23671,Exact venue POI,Mapped venue POI (approximately 5–15 m),No,"1 Piccadilly Gardens, M1 1RN",https://mapcarta.com/N6404969129,https://mapcarta.com/N6404969129,https://www.google.com/maps/search/?api=1&query=53.480330%2C-2.236710,
Approved,Dave’s Hot Chicken,53.485185,-2.240775,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"27 Withy Grove, M4 2BS",https://www.doogal.co.uk/ShowMap?postcode=M4%202BS,https://www.doogal.co.uk/ShowMap?postcode=M4%202BS,https://www.google.com/maps/search/?api=1&query=53.485185%2C-2.240775,
Approved,Detroit Slims,53.47272,-2.23913,Exact venue POI (OpenStreetMap / mapped venue),Mapped venue POI (approximately 5–15 m),No,"Circle Square, Oxford Road, M1 7FS",https://mapcarta.com/N13186274248,https://mapcarta.com/N13186274248,https://www.google.com/maps/search/?api=1&query=53.472720%2C-2.239130,
Approved,Wing Stop,53.481829,-2.237803,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),Yes,"Wingstop Piccadilly, 11-13 Piccadilly, Manchester M1 1LZ",https://www.doogal.co.uk/ShowMap?postcode=M1%201LZ,https://www.tripadvisor.co.uk/Restaurant_Review-g187069-d23693013-Reviews-Wingstop_Manchester_Piccadilly-Manchester_Greater_Manchester_England.html,https://www.google.com/maps/search/?api=1&query=53.481829%2C-2.237803,Selected Wingstop Piccadilly; location not explicitly specified in Lunch Club list.
Approved,Northern Soul,53.482876,-2.235669,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"44 Tib Street, M4 1LA",https://www.doogal.co.uk/ShowMap?postcode=M4%201LA,https://www.doogal.co.uk/ShowMap?postcode=M4%201LA,https://www.google.com/maps/search/?api=1&query=53.482876%2C-2.235669,
Approved,Popeyes,53.48084,-2.23602,Exact venue POI (OpenStreetMap / mapped venue),Mapped venue POI (approximately 5–15 m),Yes,"Popeyes, 1 Piccadilly Gardens, Manchester M1 1RG",https://mapcarta.com/N3625030281,https://mapcarta.com/N3625030281,https://www.google.com/maps/search/?api=1&query=53.480840%2C-2.236020,Selected Piccadilly Gardens branch; chain has other Manchester outlets. | Piccadilly Gardens branch selected
Approved,Salt & Pepper,53.483842,-2.238327,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"60–62 High Street, M4 1EA",https://www.doogal.co.uk/ShowMap?postcode=M4%201EA,https://www.doogal.co.uk/ShowMap?postcode=M4%201EA,https://www.google.com/maps/search/?api=1&query=53.483842%2C-2.238327,
Approved,This & That,53.484561,-2.238195,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"3 Soap Street, M4 1EW",https://www.doogal.co.uk/ShowMap?postcode=M4%201EW,https://www.doogal.co.uk/ShowMap?postcode=M4%201EW,https://www.google.com/maps/search/?api=1&query=53.484561%2C-2.238195,
Approved,Zaytoni,53.470479,-2.237062,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"127A Oxford Road, M1 7DY",https://www.doogal.co.uk/ShowMap?postcode=M1%207DY,https://www.doogal.co.uk/ShowMap?postcode=M1%207DY,https://www.google.com/maps/search/?api=1&query=53.470479%2C-2.237062,
Approved,Kabana,53.483791,-2.23694,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"52 Back Turner Street, M4 1FR",https://www.doogal.co.uk/ShowMap?postcode=M4%201FR,https://www.doogal.co.uk/ShowMap?postcode=M4%201FR,https://www.google.com/maps/search/?api=1&query=53.483791%2C-2.236940,
Approved,Nell’s Pizza,53.484305,-2.236084,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),Yes,"Nell’s at Common, 39-41 Edge Street, Manchester M4 1HW",https://www.doogal.co.uk/ShowMap?postcode=M4%201HW,https://nellspizza.co.uk/common-northern-quarter/,https://www.google.com/maps/search/?api=1&query=53.484305%2C-2.236084,Selected Northern Quarter (Common) branch; Kampus is an alternative at M1 3EF.
Approved,Bada Bing,53.484328,-2.233537,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"125 Oldham Street, Manchester M4 1LN",https://www.doogal.co.uk/ShowMap?postcode=M4%201LN,https://www.badabingsandwichdeli.co.uk/,https://www.google.com/maps/search/?api=1&query=53.484328%2C-2.233537,
Under Consideration,Pizza Pilgrims,53.48101,-2.247578,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"105–107 Deansgate, M3 2BQ",https://www.doogal.co.uk/ShowMap?postcode=M3%202BQ,https://www.doogal.co.uk/ShowMap?postcode=M3%202BQ,https://www.google.com/maps/search/?api=1&query=53.481010%2C-2.247578,
Under Consideration,Sandy’s Smoke Shed,53.476692,-2.2581,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Arch 121 Woollam Place, M3 4JJ",https://www.doogal.co.uk/ShowMap?postcode=M3%204JJ,https://www.doogal.co.uk/ShowMap?postcode=M3%204JJ,https://www.google.com/maps/search/?api=1&query=53.476692%2C-2.258100,
Under Consideration,Forbici Pizza,53.480412,-2.245284,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"86 Cross Street, M2 4LA",https://www.doogal.co.uk/ShowMap?postcode=M2%204LA,https://www.doogal.co.uk/ShowMap?postcode=M2%204LA,https://www.google.com/maps/search/?api=1&query=53.480412%2C-2.245284,
Under Consideration,Ohannes Burger,53.484806,-2.250327,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"104 Chapel Street, Salford M3 5DW",https://www.doogal.co.uk/ShowMap?postcode=M3%205DW,https://www.doogal.co.uk/ShowMap?postcode=M3%205DW,https://www.google.com/maps/search/?api=1&query=53.484806%2C-2.250327,
Under Consideration,Viet Deli,53.484216,-2.248697,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"22 Blackfriars Street, M3 5BQ",https://www.doogal.co.uk/ShowMap?postcode=M3%205BQ,https://www.doogal.co.uk/ShowMap?postcode=M3%205BQ,https://www.google.com/maps/search/?api=1&query=53.484216%2C-2.248697,
Under Consideration,China Buffet,53.478346,-2.240225,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"16 Nicholas Street, M1 4EJ",https://www.doogal.co.uk/ShowMap?postcode=M1%204EJ,https://www.doogal.co.uk/ShowMap?postcode=M1%204EJ,https://www.google.com/maps/search/?api=1&query=53.478346%2C-2.240225,
Under Consideration,Oppa Chicken,53.478174,-2.240992,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"43 George Street, M1 4AB",https://www.doogal.co.uk/ShowMap?postcode=M1%204AB,https://www.doogal.co.uk/ShowMap?postcode=M1%204AB,https://www.google.com/maps/search/?api=1&query=53.478174%2C-2.240992,
Under Consideration,Happy Lemon,53.477771,-2.240131,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"84 Portland Street, M1 4GX",https://www.doogal.co.uk/ShowMap?postcode=M1%204GX,https://www.doogal.co.uk/ShowMap?postcode=M1%204GX,https://www.google.com/maps/search/?api=1&query=53.477771%2C-2.240131,
Under Consideration,Soup Co,53.48051,-2.23931,Exact venue POI (OpenStreetMap / mapped venue),Mapped venue POI (approximately 5–15 m),No,"City Tower, Mosley Street, M1 4BT",https://mapcarta.com/N6535193711,https://mapcarta.com/N6535193711,https://www.google.com/maps/search/?api=1&query=53.480510%2C-2.239310,"Mapped Soup Co at Piccadilly Plaza (B4, M1 4AH); previously listed City Tower M1 4BT; check storefront address."
Under Consideration,House of Social,53.472098,-2.245402,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"10 Sir Howard Bernstein Approach, M15 4ND",https://www.doogal.co.uk/ShowMap?postcode=M15%204ND,https://www.doogal.co.uk/ShowMap?postcode=M15%204ND,https://www.google.com/maps/search/?api=1&query=53.472098%2C-2.245402,
Under Consideration,VietShack,53.483524,-2.230926,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"63–65 Great Ancoats Street, M4 5AB",https://www.doogal.co.uk/ShowMap?postcode=M4%205AB,https://www.doogal.co.uk/ShowMap?postcode=M4%205AB,https://www.google.com/maps/search/?api=1&query=53.483524%2C-2.230926,
Under Consideration,Ad Maiora,53.483741,-2.234619,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"84 Tib Street, M4 1LG",https://www.doogal.co.uk/ShowMap?postcode=M4%201LG,https://www.doogal.co.uk/ShowMap?postcode=M4%201LG,https://www.google.com/maps/search/?api=1&query=53.483741%2C-2.234619,
Under Consideration,Butty’s Booth,53.456911,-2.264984,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"18 Powell Street, Old Trafford, Manchester M16 7QR",https://www.doogal.co.uk/ShowMap?postcode=M16%207QR,https://www.halaljoints.com/restaurant/1ixf3olmcbtfwq7-buttys-booth-old-trafford-manchester-halal-food-restaurant,https://www.google.com/maps/search/?api=1&query=53.456911%2C-2.264984,"Address verified via a business location listing at 18 Powell Street. Food Standards Agency lists a private registered address (M16). Postcode centroid, not exact stall / entrance."
To Be Assessed,Eggslut,53.479804,-2.248053,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"129 Deansgate, M3 3WR",https://www.doogal.co.uk/ShowMap?postcode=M3%203WR,https://www.doogal.co.uk/ShowMap?postcode=M3%203WR,https://www.google.com/maps/search/?api=1&query=53.479804%2C-2.248053,
To Be Assessed,Armenian Taverna,53.48011,-2.24479,Exact venue POI,Mapped venue POI (approximately 5–15 m),No,"1–7 Princess Street, M2 4DF",https://mapcarta.com/N258871622,https://mapcarta.com/N258871622,https://www.google.com/maps/search/?api=1&query=53.480110%2C-2.244790,
To Be Assessed,Rajdoot Tandoori,53.478866,-2.245652,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Carlton House, Albert Square, M2 5PE",https://www.doogal.co.uk/ShowMap?postcode=M2%205PE,https://www.doogal.co.uk/ShowMap?postcode=M2%205PE,https://www.google.com/maps/search/?api=1&query=53.478866%2C-2.245652,
To Be Assessed,Only Pho U,53.484806,-2.250327,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"102 Chapel Street, Salford M3 5DW",https://www.doogal.co.uk/ShowMap?postcode=M3%205DW,https://www.doogal.co.uk/ShowMap?postcode=M3%205DW,https://www.google.com/maps/search/?api=1&query=53.484806%2C-2.250327,
To Be Assessed,Thai Kitchen No. 6,53.48171,-2.243498,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Chapel Walks, M2 1HN",https://www.doogal.co.uk/ShowMap?postcode=M2%201HN,https://www.doogal.co.uk/ShowMap?postcode=M2%201HN,https://www.google.com/maps/search/?api=1&query=53.481710%2C-2.243498,
To Be Assessed,The Mews,53.477374,-2.249832,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Unit K, L, M, Deansgate Mews, 253 Deansgate, Manchester M3 4EN",https://www.doogal.co.uk/ShowMap?postcode=M3%204EN,https://www.themewsmcr.co.uk/,https://www.google.com/maps/search/?api=1&query=53.477374%2C-2.249832,"Verified as The Mews Bar & Charcuterie at Unit K/L/M, Deansgate Mews; venue official website confirms address. Coordinates refer to the wider building postcode, not the unit."
To Be Assessed,Little Brewski,53.479386,-2.241541,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),Yes,"39 Booth Street, Manchester M2 4AA",https://www.doogal.co.uk/ShowMap?postcode=M2%204AA,https://www.manchestersfinest.com/places/foldies/,https://www.google.com/maps/search/?api=1&query=53.479386%2C-2.241541,Former/associated Little Brewski address; site may have changed trading name to Foldies.
To Be Assessed,WakuWaku,53.478357,-2.23914,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"54 Portland Street, Manchester M1 4QU",https://www.doogal.co.uk/ShowMap?postcode=M1%204QU,https://www.creativetourist.com/venue/wakuwaku/,https://www.google.com/maps/search/?api=1&query=53.478357%2C-2.239140,
To Be Assessed,Bullgogi,53.480497,-2.239107,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"6A Piccadilly Plaza, Manchester M1 4AH",https://www.doogal.co.uk/ShowMap?postcode=M1%204AH,https://www.bullgogi.com/locations,https://www.google.com/maps/search/?api=1&query=53.480497%2C-2.239107,
To Be Assessed,MEATWORKS,53.472875,-2.238959,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Circle Square, Oxford Road, Manchester M1 7FS",https://www.doogal.co.uk/ShowMap?postcode=M1%207FS,https://thatsup.co.uk/manchester/restaurant/meatworks-manchester,https://www.google.com/maps/search/?api=1&query=53.472875%2C-2.238959,Large development postcode; exact unit point unverified.
To Be Assessed,The Palace Cantina,53.482534,-2.236195,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Third floor, Afflecks Palace, 52 Church Street, Manchester M4 1PW",https://www.doogal.co.uk/ShowMap?postcode=M4%201PW,https://www.urbanary.co.uk/venues/manchester/the-palace-cantina,https://www.google.com/maps/search/?api=1&query=53.482534%2C-2.236195,Building-level postcode; unit is inside multi-level Afflecks.
To Be Assessed,Rustica,53.483327,-2.235039,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Hilton House, 1 Hilton Street, Manchester M4 1LP",https://www.doogal.co.uk/ShowMap?postcode=M4%201LP,https://thatsup.co.uk/manchester/restaurant/rustica,https://www.google.com/maps/search/?api=1&query=53.483327%2C-2.235039,
To Be Assessed,Kool Runnings,53.462588,-2.258558,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"118 Chorlton Road, Old Trafford, Manchester M15 4AN",https://www.doogal.co.uk/ShowMap?postcode=M15%204AN,https://thatsup.co.uk/manchester/restaurant/kool-runnings-old-trafford/,https://www.google.com/maps/search/?api=1&query=53.462588%2C-2.258558,
To Be Assessed,Rusholme Chippy,53.45453,-2.225077,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"62 Wilmslow Road, Rusholme, Manchester M14 5AL",https://www.doogal.co.uk/ShowMap?postcode=M14%205AL,https://www.chamberofcommerce.uk/business-directory/england/manchester/miscellaneous/2346564-rusholme-chippy,https://www.google.com/maps/search/?api=1&query=53.454530%2C-2.225077,
Rejected,Arndale Shawarma,53.48395,-2.23848,Exact venue POI (OpenStreetMap / mapped venue),Mapped venue POI (approximately 5–15 m),No,"68 High Street, Manchester M4 1EA",https://mapcarta.com/N9876945729,https://mapcarta.com/N9876945729,https://www.google.com/maps/search/?api=1&query=53.483950%2C-2.238480,
Rejected,Cafe Istanbul,53.48115,-2.249101,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"79-81 Bridge Street, Manchester M3 2RH",https://www.doogal.co.uk/ShowMap?postcode=M3%202RH,https://www.cafeistanbulmanchester.co.uk/,https://www.google.com/maps/search/?api=1&query=53.481150%2C-2.249101,
Rejected,Caribbean Flavas,53.48331,-2.2551,Exact venue POI,Mapped venue POI (approximately 5–15 m),No,"Salford, city centre (historic OSM POI)",https://mapcarta.com/N10174719256,https://mapcarta.com/N10174719256,https://www.google.com/maps/search/?api=1&query=53.483310%2C-2.255100,Historic map record; operation/current venue not confirmed.
Rejected,Great British Doner,53.482225,-2.246756,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),Yes,"GBD, 61 Deansgate, Manchester M3 2BW",https://www.doogal.co.uk/ShowMap?postcode=M3%202BW,https://ratings.food.gov.uk/business/1831164,https://www.google.com/maps/search/?api=1&query=53.482225%2C-2.246756,Selected Deansgate branch; Great British Doner also operates other Manchester branches.
Rejected,Hop Vietnamese,53.482512,-2.242388,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"26 Market Street, Manchester M1 1PW",https://www.doogal.co.uk/ShowMap?postcode=M1%201PW,https://hopvietnamese.co.uk/location/manchester-city/,https://www.google.com/maps/search/?api=1&query=53.482512%2C-2.242388,
Rejected,Itsu,53.480116,-2.249547,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),Yes,"Unit A4, Spinningfields Square, Manchester M3 3AP",https://www.doogal.co.uk/ShowMap?postcode=M3%203AP,https://www.itsu.com/location/manchester/manchester-spinningfields-square/,https://www.google.com/maps/search/?api=1&query=53.480116%2C-2.249547,Selected Spinningfields branch; multiple Manchester branches possible.
Rejected,Katsouris Deli,53.48101,-2.247578,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"113 Deansgate, Manchester M3 2BQ",https://www.doogal.co.uk/ShowMap?postcode=M3%202BQ,https://katsourisdeli.com/contact/,https://www.google.com/maps/search/?api=1&query=53.481010%2C-2.247578,
Rejected,Koreana,53.48143,-2.248846,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"40A King Street West, Manchester M3 2WY",https://www.doogal.co.uk/ShowMap?postcode=M3%202WY,https://www.koreana.co.uk/,https://www.google.com/maps/search/?api=1&query=53.481430%2C-2.248846,
Rejected,Panchos Burritos,53.483741,-2.239155,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Unit FC1, Arndale Market, 49 High Street, Manchester M4 3AH",https://www.doogal.co.uk/ShowMap?postcode=M4%203AH,https://www.panchosburritos.co.uk/contact-us/,https://www.google.com/maps/search/?api=1&query=53.483741%2C-2.239155,"Market stall; postcode centroid represents whole market, not FC1 stall."
Rejected,Pret A Manger,53.479607,-2.252211,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),Yes,"Pret A Manger, Unit R2, 4 Hardman Square, Spinningfields, Manchester M3 3EB",https://www.doogal.co.uk/ShowMap?postcode=M3%203EB,https://www.visitmanchester.com/listing/pret-a-manger-spinningfields/42132101/,https://www.google.com/maps/search/?api=1&query=53.479607%2C-2.252211,"PROVISIONAL BRANCH: 4 Hardman Square, Spinningfields, chosen as a plausible central location; the Lunch Club did not specify which Pret. This is the M3 3EB postcode centroid, not a verified shop doorway; please confirm branch."
Rejected,Salvi’s,53.485046,-2.243005,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),Yes,"Salvi’s Mozzarella Bar, Corn Exchange, Manchester M4 3TR",https://www.doogal.co.uk/ShowMap?postcode=M4%203TR,https://tasteofmanchester.com/venue/salvis-mozzarella-bar-and-restaurant/,https://www.google.com/maps/search/?api=1&query=53.485046%2C-2.243005,"Provisional choice: Corn Exchange. Multiple Salvi’s branches, and some have closed; confirm visited branch."
Rejected,Smoke & Pepper,53.482658,-2.237039,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Transmission House, 11 Tib Street, Manchester M4 1AF",https://www.doogal.co.uk/ShowMap?postcode=M4%201AF,https://smokeandpepper.com/locations/,https://www.google.com/maps/search/?api=1&query=53.482658%2C-2.237039,
Rejected,Tangerine,53.48266,-2.253721,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Arch 60-61, 13-17 New Bailey Street, Salford M3 5FS",https://www.doogal.co.uk/ShowMap?postcode=M3%205FS,https://www.creativetourist.com/venue/tangerine/,https://www.google.com/maps/search/?api=1&query=53.482660%2C-2.253721,
Rejected,Wagamama,53.478432,-2.242365,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),Yes,"2 St Peters Square, Manchester M2 3LQ",https://www.doogal.co.uk/ShowMap?postcode=M2%203LQ,https://www.wagamama.com/restaurants/manchester/manchester-st-peters-square,https://www.google.com/maps/search/?api=1&query=53.478432%2C-2.242365,Provisional choice: St Peter’s Square; multiple branches including Printworks. Postcode is recorded as terminated on doogal; use as approximate only.
Rejected,Pho Cue,53.47809,-2.24037,Exact venue POI (OpenStreetMap / mapped venue),Mapped venue POI (approximately 5–15 m),No,"52A Faulkner Street, Manchester M1 4FH",https://findit.city/en/uk/manchester/places/restaurants/pho-cue-2692887698,https://www.phocue.co.uk/,https://www.google.com/maps/search/?api=1&query=53.478090%2C-2.240370,
Rejected,Dunkin' Burgers,53.483741,-2.239155,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Unit F8, Manchester Arndale Market, 49 High Street, Manchester M4 3AH",https://www.doogal.co.uk/ShowMap?postcode=M4%203AH,https://ratings.food.gov.uk/business/1818139/dunkin-burgers-manchester,https://www.google.com/maps/search/?api=1&query=53.483741%2C-2.239155,"Verified FSA listing identifies Unit F8 in Manchester Arndale Market. Postcode coordinates locate the market, not an individual market stall."
Rejected,Maki & Ramen,53.484221,-2.237515,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),Yes,"Northern Quarter, The Landmark, 78-88 High Street, Manchester M4 1ES",https://www.doogal.co.uk/ShowMap?postcode=M4%201ES,https://www.makiramen.com/our-venues/manchester-northern-quarter/,https://www.google.com/maps/search/?api=1&query=53.484221%2C-2.237515,Provisional choice: Northern Quarter; alternative 11 York Street (M2 2AW).
Rejected,Ancoats Deli,53.48392,-2.22759,Exact venue POI (OpenStreetMap / mapped venue),Mapped venue POI (approximately 5–15 m),No,"6 Murray Street, Ancoats, Manchester M4 6HS",https://mapcarta.com/N12529880942,https://www.ancoatsdeli.com/,https://www.google.com/maps/search/?api=1&query=53.483920%2C-2.227590,
Rejected,Sqew Shawarma Bar,53.482225,-2.246756,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"75 Deansgate, Manchester M3 2BW",https://www.doogal.co.uk/ShowMap?postcode=M3%202BW,https://www.sqew.uk/locations/,https://www.google.com/maps/search/?api=1&query=53.482225%2C-2.246756,
Rejected,Street Food Kitchen by eastZeast,53.484216,-2.248697,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"30 Blackfriars Street, Salford M3 5BQ",https://www.doogal.co.uk/ShowMap?postcode=M3%205BQ,https://restaurantguru.com/East-to-East-Manchester,https://www.google.com/maps/search/?api=1&query=53.484216%2C-2.248697,Historical street food operation adjacent to eastZeast restaurant; postcode is approximate.
If We Must,Blues Kitchen,53.478271,-2.250832,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"13 Quay Street, Manchester M3 3HN",https://www.doogal.co.uk/ShowMap?postcode=M3%203HN,https://www.doogal.co.uk/ShowMap?postcode=M3%203HN,https://www.google.com/maps/search/?api=1&query=53.478271%2C-2.250832,
If We Must,Bundobust,53.47543,-2.2416,Venue-level external map coordinate; check Google Maps pin,Venue map coordinate (check exact pin),Yes,"St James Building, 61–69 Oxford Street, M1 6EQ",https://findit.city/en/uk/manchester/places/restaurants/bundobust-9895946394,https://findit.city/en/uk/manchester/places/restaurants/bundobust-9895946394,https://www.google.com/maps/search/?api=1&query=53.475430%2C-2.241600,PROVISIONAL BRANCH: Oxford Street brewery; Bundobust also operates a Piccadilly site. Confirm which branch the Lunch Club visited.
If We Must,Mr Su’s Noodles,53.473111,-2.237905,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Vita Circle Square, 7 Nobel Way, Manchester M1 7FU",https://www.doogal.co.uk/ShowMap?postcode=M1%207FU,https://www.mrsus.co.uk/,https://www.google.com/maps/search/?api=1&query=53.473111%2C-2.237905,
If We Must,Rudy’s,53.4842,-2.2294,Venue-level external map coordinate; check Google Maps pin,Venue map coordinate (check exact pin),Yes,"9 Cotton Street, Ancoats, M4 5BF",https://aroundus.com/p/172172814-rudy-s-pizza,https://aroundus.com/p/172172814-rudy-s-pizza,https://www.google.com/maps/search/?api=1&query=53.484200%2C-2.229400,PROVISIONAL BRANCH: Ancoats (9 Cotton Street); Rudy’s has other Manchester locations. Confirm the particular venue visited.
If We Must,Suki Suki Street Food,53.477374,-2.249832,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"227 Deansgate, Manchester M3 4EN",https://www.doogal.co.uk/ShowMap?postcode=M3%204EN,https://sukisukistreetfood.co.uk/,https://www.google.com/maps/search/?api=1&query=53.477374%2C-2.249832,
If We Must,Oast House,53.48068,-2.25112,Venue-level external map coordinate; check Google Maps pin,Venue map coordinate (check exact pin),No,"The Oast House, Crown Square, Spinningfields, M3 3AY",https://ma.to/event/oast-house-live-25-apr-2026,https://ma.to/event/oast-house-live-25-apr-2026,https://www.google.com/maps/search/?api=1&query=53.480680%2C-2.251120,Spinningfields venue location.
If We Must,Roadies,53.476948,-2.238062,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Roadie's, 41 Bloom Street, Manchester M1 3LY",https://www.doogal.co.uk/ShowMap?postcode=M1%203LY,https://roadies-manchester.com/,https://www.google.com/maps/search/?api=1&query=53.476948%2C-2.238062,
If We Must,Trading Route,53.478835,-2.255989,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"1 Goods Yard Street, Manchester M3 3BG",https://www.doogal.co.uk/ShowMap?postcode=M3%203BG,https://www.spinningfields.co.uk/directory_listing/,https://www.google.com/maps/search/?api=1&query=53.478835%2C-2.255989,
If We Must,Zaap Thai Street Food,53.479995,-2.24703,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Unit 3, The Lincoln, 9 Brazennose Street, Manchester M2 5AD",https://zaapthai.co.uk/locations/manchester/,https://zaapthai.co.uk/locations/manchester/,https://www.google.com/maps/search/?api=1&query=53.479995%2C-2.247030,
If We Must,Doux Chaton,53.476357,-2.250474,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"265-267 Deansgate, Manchester M3 4EW",https://www.doogal.co.uk/ShowMap?postcode=M3%204EW,https://www.douxchaton.com/location,https://www.google.com/maps/search/?api=1&query=53.476357%2C-2.250474,The Great Northern website reports the Manchester site is now closed.
Gone But Not Forgotten,Almost Famous,53.47755,-2.24881,Exact venue POI (OpenStreetMap / mapped venue),Mapped venue POI (approximately 5–15 m),Yes,"Former Deansgate/Great Northern site, 235 Deansgate, Manchester M3 4FN",https://mapcarta.com/N2775492848,https://mapcarta.com/N2775492848,https://www.google.com/maps/search/?api=1&query=53.477550%2C-2.248810,Mapped historical Great Northern branch. Northern Quarter branch at 49-51 Edge Street M4 1HW is operating again in 2026. | Historical Deansgate/Great Northern POI
Gone But Not Forgotten,The Tattooed Goat,,,Unable to identify Manchester venue,Not located,Yes,,,,https://www.google.com/maps/search/?api=1&query=The%20Tattooed%20Goat%20Manchester,No traceable business location or postcode could be matched to the exact name in Manchester. It would be misleading to assign a coordinate. A former address or approximate area is needed.
Gone But Not Forgotten,Doug’s Burger’s,53.472875,-2.238959,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Former Doug's Hamburgers, No.1 Circle Square, 3 Symphony Park, Manchester M1 7FS",https://www.doogal.co.uk/ShowMap?postcode=M1%207FS,https://restaurantguru.com/Dougs-Hamburgers-Manchester,https://www.google.com/maps/search/?api=1&query=53.472875%2C-2.238959,Name as supplied; historical location unconfirmed. | Former unit subsequently occupied by Gooey; coordinates are Circle Square postcode area.
Gone But Not Forgotten,Bearded Feeder,53.481821,-2.237291,Postcode centroid (approximate; not an entrance pin),Postcode / building area (typically tens of metres),No,"Former Piccadilly Gardens Food Markets, Manchester M1 1LY",https://www.doogal.co.uk/ShowMap?postcode=M1%201LY,https://www.yell.com/biz/bearded-feeder-manchester-10465566/,https://www.google.com/maps/search/?api=1&query=53.481821%2C-2.237291,"Former outdoor street-food stall; postcode centroid, not permanent stall position."`;

// Parse CSV lines cleanly handling quotes
function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const row = [];
    let insideQuotes = false;
    let currentField = '';
    
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const char = line[charIndex];
      if (char === '"') {
        if (insideQuotes && line[charIndex + 1] === '"') {
          currentField += '"';
          charIndex++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        row.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    row.push(currentField);
    rows.push(row);
  }
  return rows;
}

const customMetadata = {
  "crazy-pedros": {
    cost: "££",
    cuisine: "Pizza & Slices",
    eatLikeUs: "The Chippy Tea slice with curry sauce dip, washed down with a can of Ting. Do not hesitate.",
    lastInspectionDate: "2026-09-18",
    notes: "Late-night slice joint that functions as an emergency lunchtime oasis. Fast, greasy, righteous."
  },
  "fazenda-fogo-de-chao": {
    cost: "£££",
    cuisine: "Brazilian Rodizio",
    eatLikeUs: "Picanha medium-rare straight off the skewer. Skip the salad bar filler; preserve maximum abdominal capacity for continuous skewers.",
    lastInspectionDate: "2026-09-04",
    notes: "Official Payday summit venue. Green card must remain displayed until breathing becomes noticeably labored."
  },
  "flat-iron": {
    cost: "££",
    cuisine: "Steakhouse",
    eatLikeUs: "The signature flat iron steak, medium-rare, beef dripping chips, béarnaise, and the ceremonial salted caramel soft serve cone on exit.",
    lastInspectionDate: "2026-08-28",
    notes: "Sublime meat execution. The tiny cleaver serves as a reminder of solemn lunchtime duty."
  },
  "street-guys-street-star": {
    cost: "£",
    cuisine: "Burgers & Loaded Fries",
    eatLikeUs: "Double beef smash burger with grilled jalapeños, signature sauce, and cajun seasoned fries.",
    lastInspectionDate: "2026-08-15",
    notes: "Hidden gem off Bridge Street. Punchy seasoning and swift turnaround."
  },
  "wok-to-walk": {
    cost: "£",
    cuisine: "Wok Noodles",
    eatLikeUs: "Egg noodles, sweet & sour sauce, chicken breast, broccoli florets, and crispy fried garlic on top.",
    lastInspectionDate: "2026-07-22",
    notes: "The pragmatic option when tribunal deliberations run over and time is scarce."
  },
  "wrights-fish-chips": {
    cost: "£",
    cuisine: "Traditional Chippy",
    eatLikeUs: "Fresh haddock, proper beef dripping chips, marrowfat mushy peas, Irish curry sauce, and a floured barm cake for assembly.",
    lastInspectionDate: "2026-09-11",
    notes: "Cross Street heritage institution. The aroma alone commands immediate obedience."
  },
  "lakeland-grocers-in-the-city": {
    cost: "£",
    cuisine: "Deli & Bakery",
    eatLikeUs: "Cumbrian shortcrust pasty, thick Cumberland sausage roll, and a slice of gingerbread.",
    lastInspectionDate: "2026-06-30",
    notes: "Hearty northern fuel. Generous pastry density."
  },
  "mick-hucknalls-rustik-bites": {
    cost: "£",
    cuisine: "Cafe & Bakes",
    eatLikeUs: "The Deansgate sausage bap with brown sauce, followed by an unapologetic square of flapjack.",
    lastInspectionDate: "2026-07-09",
    notes: "Holds curious local folklore appeal. Reliable grab-and-go fuel."
  },
  "new-wave-ramen": {
    cost: "££",
    cuisine: "Ramen",
    eatLikeUs: "Shoyu paitan ramen, double chashu pork, ajitsuke tamago, nori, and a side of chili rayu. Slurp with dignity.",
    lastInspectionDate: "2026-08-19",
    notes: "Precision broth chemistry on Tib Lane. Deep contemplation guaranteed."
  },
  "double-zero": {
    cost: "££",
    cuisine: "Neapolitan Pizza",
    eatLikeUs: "Diavola with nduja and hot honey drizzle. Crust blistering is exemplary.",
    lastInspectionDate: "2026-09-02",
    notes: "Spring Gardens outpost delivers blistered perfection. Fast 90-second bake."
  },
  "fat-pats": {
    cost: "££",
    cuisine: "Gourmet Subs",
    eatLikeUs: "Hot Honey Fried Chicken 8-inch milk bread sub with pimento cheese and pickles. Grab four napkins immediately.",
    lastInspectionDate: "2026-09-25",
    notes: "Alleyway takeout of colossal proportion. Requires both hands and an unwavering spine."
  },
  "happy-seasons": {
    cost: "££",
    cuisine: "Cantonese BBQ",
    eatLikeUs: "Three-roast meat platter (Crispy Pork Belly, Roast Duck, Char Siu) on boiled rice with supreme ginger-scallion sauce.",
    lastInspectionDate: "2026-09-14",
    notes: "Chinatown royalty. Queue strictly commences at 11:50; tardiness results in forfeit."
  },
  "listos-burrito": {
    cost: "£",
    cuisine: "Mexican / Burritos",
    eatLikeUs: "Slow-braised pork carnitas burrito, black beans, lime rice, charred habanero salsa, and Monterey Jack.",
    lastInspectionDate: "2026-08-04",
    notes: "Oxford Street stronghold. Structural foil wrap ensures zero casualty rate on the pavement."
  },
  "lotties-bakehouse": {
    cost: "£",
    cuisine: "Bakery & Toasties",
    eatLikeUs: "Artisanal grilled cheese on seeded sourdough, followed by the pistachio cardamom custard bun.",
    lastInspectionDate: "2026-02-14",
    notes: "Basement Charlotte Street sanctuary. Overdue for re-audit per Article 4.2."
  },
  "that-ziki": {
    cost: "££",
    cuisine: "Greek Street Food",
    eatLikeUs: "Pork belly gyros wrap loaded with oregano fries, pickled onions, and house tzatziki.",
    lastInspectionDate: "2026-08-11",
    notes: "Generous pita wrap loaded with explosive Mediterranean vigor."
  },
  "bunny-jacksons": {
    cost: "£",
    cuisine: "Wings & Dive Bar",
    eatLikeUs: "A tower of 20p wings (Buffalo and Nashville Hot), loaded tater tots, and an ice-cold root beer.",
    lastInspectionDate: "2026-07-17",
    notes: "Chaotic energy, impossible prices. Ideal for low-protocol Fridays."
  },
  "bird-of-prey": {
    cost: "££",
    cuisine: "Fried Chicken",
    eatLikeUs: "The Messy Bird burger with spicy fried thigh, slaw, house pickles, and seasoned crinkle fries.",
    lastInspectionDate: "2026-07-28",
    notes: "Buttermilk mastery on Charles Street. High crunch-to-meat ratio."
  },
  "burgerism": {
    cost: "£",
    cuisine: "Smash Burgers",
    eatLikeUs: "The Cheesed burger (double smash patty, American cheese, house sauce), seasoned skin-on fries, and chicken bites.",
    lastInspectionDate: "2026-08-31",
    notes: "The benchmark Manchester smash burger. Quick collection at Piccadilly Gardens."
  },
  "daves-hot-chicken": {
    cost: "££",
    cuisine: "Nashville Hot Chicken",
    eatLikeUs: "Two tender slider combo at 'Hot' spice tier with crinkle fries and Dave's sauce. (Do not order Reaper before tribunal sessions).",
    lastInspectionDate: "2026-08-20",
    notes: "Withy Grove arrival with serious heat profile and buttery buns."
  },
  "detroit-slims": {
    cost: "£",
    cuisine: "Detroit Pan Pizza",
    eatLikeUs: "Pepperoni square pan slice with caramelized frico cheese crust and spicy marinara dip.",
    lastInspectionDate: "2026-09-08",
    notes: "Crisp pan edges at Circle Square. Substantial lunch in a neat rectangular format."
  },
  "wing-stop": {
    cost: "££",
    cuisine: "Wings",
    eatLikeUs: "8 boneless wings tossed in Garlic Parmesan and Mango Habanero, plus seasoned voodoo fries.",
    lastInspectionDate: "2026-07-15",
    notes: "Piccadilly branch approved after thorough sauce consistency inspection."
  },
  "northern-soul": {
    cost: "££",
    cuisine: "Grilled Cheese",
    eatLikeUs: "The Soul Classic (secret three-cheese blend on sourdough) with caramelized onion chutney and a pot of tomato soup dip.",
    lastInspectionDate: "2026-08-25",
    notes: "Tib Street staple. The definitive gold standard of Manchester melted cheese."
  },
  "popeyes": {
    cost: "£",
    cuisine: "Louisiana Fried Chicken",
    eatLikeUs: "Spicy Chicken Sandwich, cajun fries, and a buttermilk biscuit with honey.",
    lastInspectionDate: "2026-06-18",
    notes: "Mass-market fried chicken elevated by remarkable batter shatter."
  },
  "salt-pepper": {
    cost: "££",
    cuisine: "Chinese Street Food",
    eatLikeUs: "The Half-and-Half (salt & pepper crispy chicken over chips and egg fried rice) with sweet curry sauce and extra fresh chilies.",
    lastInspectionDate: "2026-09-17",
    notes: "Northern Quarter institution. The quintessential Manchester comfort tray."
  },
  "this-that": {
    cost: "£",
    cuisine: "Rice 'n' Three",
    eatLikeUs: "Rice 'n' Three: Lamb Nihari, Chicken Tikka Masala, and Chana Dal, accompanied by a fresh tandoori roti.",
    lastInspectionDate: "2026-09-22",
    notes: "The foundational temple of Manchester lunchtime culture on Soap Street since 1984."
  },
  "zaytoni": {
    cost: "£",
    cuisine: "Levantine / Shawarma",
    eatLikeUs: "Chicken and lamb mixed shawarma wrap toasted on the saj with extra garlic toum and pickled gherkins.",
    lastInspectionDate: "2026-06-25",
    notes: "Oxford Road haven of authentic Levantine spices and fragrant spit-roasted meats."
  },
  "kabana": {
    cost: "£",
    cuisine: "Rice 'n' Three",
    eatLikeUs: "Karahi Gosht and Daal over saffron basmati rice with freshly slapped roti.",
    lastInspectionDate: "2026-01-20",
    notes: "Northern Quarter backstreet legend. OVERDUE FOR RE-INSPECTION (Article 7 warning issued)."
  },
  "nells-pizza": {
    cost: "££",
    cuisine: "NYC Style Pizza",
    eatLikeUs: "14-inch Original Sausage slice or cheese slice folded in half, dipped in hot honey.",
    lastInspectionDate: "2026-08-05",
    notes: "Enormous NYC-style slices with crisp undercarriage. High conviviality index."
  },
  "bada-bing": {
    cost: "££",
    cuisine: "Italian-American Subs",
    eatLikeUs: "The Carmela sub: fennel salami, spicy mortadella, aged provolone, shredded iceberg, and house vinaigrette on focaccia.",
    lastInspectionDate: "2026-09-26",
    notes: "Oldham Street colossus. Two-fisted Italian-American heavyweight."
  }
};

const rows = parseCsv(rawCsv);
console.log(`Parsed ${rows.length} venues from CSV.`);

let approvedRank = 1;
const venues = [];
const inspections = [];

// Seed baseline inspections for Approved venues so history is rich
const mockInspectors = [
  ["Chair Fletcher", "Vice-Chair Sterling"],
  ["Chair Fletcher", "Comptroller Davies"],
  ["Vice-Chair Sterling", "Comptroller Davies"],
  ["Chair Fletcher", "Vice-Chair Sterling", "Lord Higgins"],
  ["Comptroller Davies", "Secretary Thorne"]
];

rows.forEach((r, idx) => {
  const status = r[0].trim();
  const rawName = r[1].trim();
  const latStr = r[2].trim();
  const lngStr = r[3].trim();
  const address = r[7] ? r[7].trim() : '';
  const evidenceUrl = r[8] ? r[8].trim() : '';
  const mapSearchLink = r[10] ? r[10].trim() : '';
  const rawNotes = r[11] ? r[11].trim() : '';

  const lat = latStr ? parseFloat(latStr) : null;
  const lng = lngStr ? parseFloat(lngStr) : null;
  const slug = slugify(rawName);

  const dist = (lat && lng) ? haversineMiles(BASE_LAT, BASE_LNG, lat, lng) : 0;
  const walkMin = calcWalkTime(dist);

  let rank = null;
  if (status === 'Approved') {
    rank = approvedRank++;
  }

  const custom = customMetadata[slug] || {};
  
  let cost = custom.cost;
  if (!cost) {
    if (status === 'Approved') cost = '££';
    else if (rawName.includes('Buffet') || rawName.includes('Pret') || rawName.includes('Itsu') || rawName.includes('Deli')) cost = '£';
    else if (rawName.includes('Taverna') || rawName.includes('Mews') || rawName.includes('Kitchen')) cost = '£££';
    else cost = '££';
  }

  let cuisine = custom.cuisine;
  if (!cuisine) {
    if (rawName.toLowerCase().includes('pizza')) cuisine = 'Pizza';
    else if (rawName.toLowerCase().includes('burger')) cuisine = 'Burgers';
    else if (rawName.toLowerCase().includes('chicken') || rawName.toLowerCase().includes('wing')) cuisine = 'Fried Chicken';
    else if (rawName.toLowerCase().includes('chippy') || rawName.toLowerCase().includes('fish')) cuisine = 'Fish & Chips';
    else if (rawName.toLowerCase().includes('ramen') || rawName.toLowerCase().includes('pho') || rawName.toLowerCase().includes('noodle')) cuisine = 'Asian Noodles & Soups';
    else if (rawName.toLowerCase().includes('deli') || rawName.toLowerCase().includes('sandwich') || rawName.toLowerCase().includes('sub')) cuisine = 'Deli & Sandwiches';
    else if (rawName.toLowerCase().includes('tandoori') || rawName.toLowerCase().includes('indian') || rawName.toLowerCase().includes('curry')) cuisine = 'Indian';
    else cuisine = 'Casual Dining';
  }

  let eatLikeUs = custom.eatLikeUs;
  if (!eatLikeUs) {
    eatLikeUs = `The committee signature recommendation for ${rawName}: order the daily house specialty with extra pickles, tap water, and prompt departure before 13:10.`;
  }

  let lastInspectionDate = custom.lastInspectionDate || (status === 'Approved' ? '2026-08-15' : status === 'Under Consideration' ? '2026-09-10' : status === 'Rejected' ? '2025-11-20' : '2026-01-10');

  let rejectionReason = null;
  if (status === 'Rejected') {
    rejectionReason = rawNotes || `Condemned by solemn decree of the Chairs. Unacceptable variance in standards, protracted queueing, or severe compromise of lunchtime dignity.`;
  } else if (status === 'If We Must') {
    rejectionReason = `Tolerated only during torrential rain, catastrophic client delays, or unanimous committee lethargy.`;
  }

  const venueObj = {
    id: slug,
    name: rawName,
    slug,
    status,
    rank,
    lat,
    lng,
    distanceMiles: dist,
    walkingTimeMin: walkMin,
    cost,
    cuisine,
    eatLikeUs,
    lastInspectionDate,
    rejectionReason,
    address,
    evidenceUrl,
    mapSearchLink,
    notes: custom.notes || rawNotes || ''
  };

  venues.push(venueObj);

  // Generate 2 satisfactory inspections for Approved venues (fulfilling Manifesto Two-Visit Rule!)
  if (status === 'Approved') {
    const inspectors1 = mockInspectors[idx % mockInspectors.length];
    const inspectors2 = mockInspectors[(idx + 2) % mockInspectors.length];
    inspections.push({
      id: `${slug}-insp-1`,
      venueSlug: slug,
      venueName: rawName,
      date: lastInspectionDate,
      attendees: inspectors1,
      verdict: 'satisfactory',
      whatWasOrdered: eatLikeUs,
      notes: `Confirmatory audit conducted under standard 12:25 operational conditions. Standards maintained, portion ratio exemplary, decorum upheld.`
    });
    inspections.push({
      id: `${slug}-insp-2`,
      venueSlug: slug,
      venueName: rawName,
      date: '2026-05-14',
      attendees: inspectors2,
      verdict: 'satisfactory',
      whatWasOrdered: `Secondary benchmark sampling and thermal temperature audit.`,
      notes: `Inaugural assessment visit. Met stringent criteria for tier admission under Article 2.1.`
    });
  } else if (status === 'Under Consideration') {
    inspections.push({
      id: `${slug}-insp-1`,
      venueSlug: slug,
      venueName: rawName,
      date: lastInspectionDate,
      attendees: mockInspectors[idx % mockInspectors.length],
      verdict: 'satisfactory',
      whatWasOrdered: `Trial tasting platter and speed-of-service trial.`,
      notes: `Single satisfactory inspection logged. One further confirmatory inspection required before admission to the Approved pantheon.`
    });
  } else if (status === 'Rejected') {
    inspections.push({
      id: `${slug}-insp-1`,
      venueSlug: slug,
      venueName: rawName,
      date: lastInspectionDate,
      attendees: mockInspectors[idx % mockInspectors.length],
      verdict: 'sub-par',
      whatWasOrdered: `Standard committee inspection test order.`,
      notes: rejectionReason
    });
  }
});

// Incidents for Hall of Shame — The single documented incident in Club history
const incidents = [
  {
    id: 'inc-001',
    date: '2026-07-08',
    time: '09:00',
    formattedDate: '8th July 2026 at 9am',
    location: 'Manchester Spinningfields',
    title: 'Red Roses for Forgiveness',
    peopleInvolved: [
      '@Tom Pritchard (Deactivated)',
      '@Stephen Riley'
    ],
    witnesses: [
      '@Tommy Clark'
    ],
    benefitOffered: 'Red roses for forgiveness',
    value: '£6.50',
    context: 'After a termination of position in the lunch club, Tom offered Stephen a bunch of Red M&S Roses in an attempt to have his termination rescinded.',
    outcome: 'Termination firmly upheld; rescission of termination denied. The bunch of Red M&S Roses was documented into the official archives as the sole recorded improper benefit attempt in Lunch Club history. Impartial authority of the Chairs preserved intact.'
  }
];

// Write out content files
const venuesDir = path.resolve('src/content/venues');
const inspectionsDir = path.resolve('src/content/inspections');
const incidentsDir = path.resolve('src/content/incidents');

fs.mkdirSync(venuesDir, { recursive: true });
fs.mkdirSync(inspectionsDir, { recursive: true });
fs.mkdirSync(incidentsDir, { recursive: true });

venues.forEach(v => {
  fs.writeFileSync(path.join(venuesDir, `${v.slug}.json`), JSON.stringify(v, null, 2));
});

inspections.forEach(insp => {
  fs.writeFileSync(path.join(inspectionsDir, `${insp.id}.json`), JSON.stringify(insp, null, 2));
});

incidents.forEach(inc => {
  fs.writeFileSync(path.join(incidentsDir, `${inc.id}.json`), JSON.stringify(inc, null, 2));
});

// Also write a consolidated data file in src/data for fast client consumption
fs.mkdirSync(path.resolve('src/data'), { recursive: true });
fs.writeFileSync(path.resolve('src/data/venues.json'), JSON.stringify(venues, null, 2));
fs.writeFileSync(path.resolve('src/data/inspections.json'), JSON.stringify(inspections, null, 2));
fs.writeFileSync(path.resolve('src/data/incidents.json'), JSON.stringify(incidents, null, 2));

console.log(`Generated:
- ${venues.length} venue records in src/content/venues/
- ${inspections.length} inspection records in src/content/inspections/
- ${incidents.length} bribery incidents in src/content/incidents/
- Consolidated JSON bundles in src/data/`);
