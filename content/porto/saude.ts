import "server-only";

import type {
  AnswerKey,
  Challenge,
  Experience,
  ExperienceContent,
  Hint,
  Stop,
} from "@/features/engine/types";

/**
 * Saúde! (slug `saude`): flagship 5-stop mystery pub crawl, Porto historic centre.
 *
 * MOCK: all of this is placeholder content for M1. The storyline (Inês Lobo, her
 * five-line toast, Rosário, "Azul"), dates, coordinates, opening hours, price,
 * duration and distance are invented and must be replaced with verified content
 * and real venues before launch. Every challenge must stay answerable from the
 * story or the street outside (GAME_RULES §10).
 *
 * Shape matches the M2 tables 1:1; IDs are fixed UUIDs so the M2 import keeps them.
 */

const EXPERIENCE_ID = "e9c1d9df-2ca9-4be5-bef5-ee32956922f9";

const STOP = {
  ribeira: "f197d2ef-54b8-414e-a64f-1165a92cc649",
  se: "7b7a6ef9-9028-4021-9771-8fec811bfb85",
  saoBento: "1473b312-5344-4e1a-a7d4-b8062624e1ca",
  aliados: "956ea381-d263-45a0-9dff-d1819b4c00e7",
  clerigos: "a551992a-b560-4280-b2d7-d184ba98dfc4",
} as const;

const CHALLENGE = {
  ribeira: "8f71faa0-4d16-4c4d-9023-39bcf9fbc8a8",
  se: "5b3f6064-37d6-49cf-b9ee-8f40d9ae31f5",
  saoBento: "8645a1ed-48a1-4746-aa31-25b8586c35ef",
  aliados: "6d82e745-576d-4b57-8fb7-f40015bc8d56",
  clerigos: "4440114a-5937-46ae-a858-c3182062c5e4",
} as const;

const OPTION = {
  ribeiraBoatmen: "92792b12-ede9-49d7-9205-45a3f104042e",
  ribeiraBishop: "e9d6ead2-7db6-4eeb-ae7f-02304dd03e48",
  ribeiraFishsellers: "ac051147-779c-42c5-ad10-4e10ca811842",
  ribeiraStationMaster: "2232b09b-31e8-4431-adaf-75ed6dde34d9",
  saoBentoTiles: "60d7f445-c709-4b29-b85f-e567b6ba1ce2",
  saoBentoEyes: "3bd6b87e-018a-45de-b837-4964404f5151",
  saoBentoCap: "4160210e-3bc3-435b-b96a-a51f4ceee756",
  saoBentoPainter: "c467cf2e-5c71-418a-8dbe-0476e84de93f",
  clerigosFirstLine: "cfcf373b-bf63-4ab3-818d-598157fa19d9",
  clerigosCompass: "b7803f41-373a-4699-815a-5a9df0fe48e3",
  clerigosMeetingPoint: "b3ca41d4-df67-48f7-bac3-ea5a94d9d487",
  clerigosStars: "b8712297-db8a-46ac-bbf5-4771da44808d",
} as const;

// MOCK: price (per group: one purchase covers the whole session), duration, distance and start window are placeholders.
const experience: Experience = {
  id: EXPERIENCE_ID,
  slug: "saude",
  citySlug: "porto",
  kind: "pub_crawl",
  title: "Saúde!",
  tagline: "Five bars, five lines of a lost toast. Can your group find them all?",
  description:
    "In 1891 a cellar master hid her last toast across Porto, one line at a time. Follow her trail through the old town, solve a clue at every stop and put the toast back together. Every stop serves soft drinks too, so it works whether or not you drink.",
  isFlagship: true,
  durationMinutes: 150,
  distanceMeters: 1900,
  walkingDifficulty: "hilly",
  nightNotes:
    "One steep climb from the river to the cathedral, on cobbles. The route stays on lit, busy streets. Comfortable shoes recommended.",
  recommendedStartFrom: "19:00",
  recommendedStartTo: "21:00",
  priceCents: 799,
  currency: "EUR",
  status: "published",
};

// MOCK: venue names are placeholders; coordinates are approximate public spots; hours invented.
const stops: Stop[] = [
  {
    id: STOP.ribeira,
    experienceId: EXPERIENCE_ID,
    position: 1,
    title: "The river's line",
    teaser: "Start where the boats come in: the riverside square at Ribeira.",
    // MOCK: invented story (Inês Lobo, 1891, the boatmen).
    story:
      "Porto has always drunk to the river. In 1891 a cellar master called Inês Lobo was famous along the Ribeira for her toasts: short, sharp and never repeated. The night before she left the city for good, she wrote one last toast and split it into five lines, hiding each one somewhere between the river and the hills. The first line, they say, she gave to the boatmen who carried the barrels: “To the water that brought us here.” Look at the river, then raise whatever is in your glass.",
    venueName: "[Stop 1 venue]",
    lat: 41.1407,
    lng: -8.6131,
    checkInRadiusM: 75,
    opensAt: "18:00",
    closesAt: "02:00",
    backupVenue: null,
  },
  {
    id: STOP.se,
    experienceId: EXPERIENCE_ID,
    position: 2,
    title: "Up to the cathedral",
    teaser: "Climb. It's steep, so take it slowly. The second line waits by the cathedral at the top.",
    // MOCK: invented story (Rosário the baker, the bread tin).
    story:
      "Catch your breath: you've just climbed one of the oldest streets in Porto. Up here, near the cathedral, Inês left the second line with a friend she trusted completely: a baker named Rosário, who opened her shop before dawn and closed it after midnight. Rosário kept the line folded inside a bread tin for forty years. When she finally read it aloud, the whole street went quiet: “To the hill that tests our legs.” Fair enough, after that climb.",
    venueName: "[Stop 2 venue]",
    lat: 41.1428,
    lng: -8.611,
    checkInRadiusM: 75,
    opensAt: "17:00",
    closesAt: "00:00",
    backupVenue: null,
  },
  {
    id: STOP.saoBento,
    experienceId: EXPERIENCE_ID,
    position: 3,
    title: "The station of goodbyes",
    teaser: "Head down to the railway station, where the walls tell stories in blue and white.",
    // MOCK: invented story (the porter "Azul", the ticket).
    story:
      "Everyone who arrives in Porto by train walks into a hall of blue and white tiles. Inês loved stations, because everyone in them is saying hello or goodbye. She wrote the third line on a train ticket and gave it to a porter on the platform, asking him to keep it until someone came looking. The porter, a man everyone called “Azul” because of the blue cap he never took off, carried that ticket in his pocket every day until he retired. Line three: “To everyone who arrives.”",
    venueName: "[Stop 3 venue]",
    lat: 41.1456,
    lng: -8.6105,
    checkInRadiusM: 100, // station square is wide; GPS drifts near tall facades
    opensAt: "18:00",
    closesAt: "02:00",
    backupVenue: null,
  },
  {
    id: STOP.aliados,
    experienceId: EXPERIENCE_ID,
    position: 4,
    title: "The grand avenue",
    teaser: "Walk up to the wide avenue that ends at the city hall clock.",
    // MOCK: invented story (the postcard with seven stars, the nephew).
    story:
      "This is where Porto celebrates: big news, football wins, New Year. Inês watched one of the city's first New Year parties on this avenue and counted toasts until she lost track. She hid her fourth line in plain sight: a postcard of the avenue sent to her nephew, with seven small stars drawn above the city hall and a note saying “one toast for every star”. It took him a whole summer to work it out. Line four: “To the friends who stay out late.”",
    venueName: "[Stop 4 venue]",
    lat: 41.1484,
    lng: -8.6109,
    checkInRadiusM: 75,
    opensAt: "18:00",
    closesAt: "01:00",
    // MOCK: placeholder backup venue on the same avenue; the challenge is story-based so it still works.
    backupVenue: {
      name: "[Stop 4 backup venue]",
      lat: 41.1478,
      lng: -8.6114,
      teaser: "Your fourth stop is closed right now, so head to its neighbour on the same avenue instead.",
    },
  },
  {
    id: STOP.clerigos,
    experienceId: EXPERIENCE_ID,
    position: 5,
    title: "The last line",
    teaser: "Finish below the Clérigos tower, on one of the liveliest streets in the old town.",
    // MOCK: invented story (the tower as her compass, the unwritten line).
    story:
      "You can see the Clérigos tower from almost anywhere in the old town. Inês used it as her compass: if she could see the tower, she knew her way home. The last line was never written down. She spoke it to the last person she toasted in Porto, and it has been passed from table to table ever since. Some say it changes a little every time. Now it's yours: “To the way home, and to the next time.” Saúde!",
    venueName: "[Stop 5 venue]",
    lat: 41.1468,
    lng: -8.6142,
    checkInRadiusM: 75,
    opensAt: "20:00",
    closesAt: "03:00",
    backupVenue: null,
  },
];

const challenges: Challenge[] = [
  {
    id: CHALLENGE.ribeira,
    stopId: STOP.ribeira,
    type: "multiple_choice",
    prompt: "Who did Inês give the first line of her toast to?",
    explanation: "The boatmen. A toast that starts with the river belongs to the people who work on it.",
    options: [
      { id: OPTION.ribeiraBoatmen, challengeId: CHALLENGE.ribeira, label: "The boatmen", position: 1 },
      { id: OPTION.ribeiraBishop, challengeId: CHALLENGE.ribeira, label: "The bishop", position: 2 },
      { id: OPTION.ribeiraFishsellers, challengeId: CHALLENGE.ribeira, label: "The fish sellers", position: 3 },
      { id: OPTION.ribeiraStationMaster, challengeId: CHALLENGE.ribeira, label: "The station master", position: 4 },
    ],
  },
  {
    id: CHALLENGE.se,
    stopId: STOP.se,
    type: "text",
    prompt: "What was the name of the baker who kept the second line?",
    placeholder: "Her first name",
    explanation: "Rosário, who kept the line in a bread tin for forty years.",
  },
  {
    id: CHALLENGE.saoBento,
    stopId: STOP.saoBento,
    type: "multiple_choice",
    prompt: "Why did everyone call the porter “Azul”?",
    explanation: "His blue cap, which he never took off.",
    options: [
      { id: OPTION.saoBentoTiles, challengeId: CHALLENGE.saoBento, label: "He loved the blue tiles", position: 1 },
      { id: OPTION.saoBentoEyes, challengeId: CHALLENGE.saoBento, label: "His blue eyes", position: 2 },
      { id: OPTION.saoBentoCap, challengeId: CHALLENGE.saoBento, label: "His blue cap", position: 3 },
      { id: OPTION.saoBentoPainter, challengeId: CHALLENGE.saoBento, label: "He painted the station", position: 4 },
    ],
  },
  {
    id: CHALLENGE.aliados,
    stopId: STOP.aliados,
    type: "text",
    prompt: "How many stars were drawn on the postcard?",
    placeholder: "A number",
    explanation: "Seven stars: one toast for every star.",
  },
  {
    id: CHALLENGE.clerigos,
    stopId: STOP.clerigos,
    type: "multiple_choice",
    prompt: "What did Inês use the Clérigos tower for?",
    explanation:
      "Her compass home. The whole toast: To the water that brought us here. To the hill that tests our legs. To everyone who arrives. To the friends who stay out late. To the way home, and to the next time.",
    options: [
      { id: OPTION.clerigosFirstLine, challengeId: CHALLENGE.clerigos, label: "To hide the first line", position: 1 },
      { id: OPTION.clerigosCompass, challengeId: CHALLENGE.clerigos, label: "As a compass to find her way home", position: 2 },
      { id: OPTION.clerigosMeetingPoint, challengeId: CHALLENGE.clerigos, label: "As a meeting point for the boatmen", position: 3 },
      { id: OPTION.clerigosStars, challengeId: CHALLENGE.clerigos, label: "To count the stars", position: 4 },
    ],
  },
];

const hints: Hint[] = [
  { id: "1ec2b9e8-4c9f-4e97-ba24-76c1e46b5eb2", challengeId: CHALLENGE.ribeira, level: 1, text: "Think about who worked on the water." },
  { id: "ea3da740-70fd-4c9a-b065-eed7c8b7a230", challengeId: CHALLENGE.ribeira, level: 2, text: "They carried the barrels up and down the river." },
  { id: "75b729b9-c9e9-4198-930d-88dcd77d32cb", challengeId: CHALLENGE.se, level: 1, text: "She kept the line in a bread tin." },
  { id: "b838ea5f-2794-4f32-bfaf-853178e5237d", challengeId: CHALLENGE.se, level: 2, text: "Her name starts with R and ends in “-ário”." },
  { id: "eefbd081-62a1-476c-b193-1015aa7ec8cf", challengeId: CHALLENGE.saoBento, level: 1, text: "It was something he wore." },
  { id: "1f3fadf7-1f36-4857-98dd-845fd3c3c050", challengeId: CHALLENGE.saoBento, level: 2, text: "He never took it off his head." },
  { id: "32ae90ca-72c2-4127-a6ef-2e5ec114142a", challengeId: CHALLENGE.aliados, level: 1, text: "Count the stars in the story." },
  { id: "4fd27063-8324-407e-b58b-e83c25c7c7e5", challengeId: CHALLENGE.aliados, level: 2, text: "Same as the number of days in a week." },
  { id: "d90eb2b3-4c34-4655-88e0-79fdf2e64597", challengeId: CHALLENGE.clerigos, level: 1, text: "It helped her when she was lost." },
  { id: "bb699471-46e2-4d59-9534-5706094438cb", challengeId: CHALLENGE.clerigos, level: 2, text: "If she could see it, she knew her way home." },
];

/** Server-only: the answers. */
const answerKeys: AnswerKey[] = [
  { challengeId: CHALLENGE.ribeira, type: "multiple_choice", correctOptionId: OPTION.ribeiraBoatmen },
  { challengeId: CHALLENGE.se, type: "text", acceptedAnswers: ["Rosário"], allowFuzzy: true },
  { challengeId: CHALLENGE.saoBento, type: "multiple_choice", correctOptionId: OPTION.saoBentoCap },
  { challengeId: CHALLENGE.aliados, type: "text", acceptedAnswers: ["7", "seven", "sete"], allowFuzzy: false },
  { challengeId: CHALLENGE.clerigos, type: "multiple_choice", correctOptionId: OPTION.clerigosCompass },
];

export const saude: ExperienceContent = { experience, stops, challenges, hints, answerKeys };
