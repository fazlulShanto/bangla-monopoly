export type StreetValues = {
  price: number;
  buildCost: number;
  rent: readonly [number, number, number, number, number, number];
};

// Rent order: no buildings, one house, two houses, three houses, four houses, hotel.
export const GAME_CONFIG = {
  startingCash: { default: 1500, min: 500, max: 10_000 },
  goSalary: 200,
  bail: 50,
  airportPrice: 200,
  airportRent: [25, 50, 100, 200],
  utilityPrice: 150,
  taxes: { income: 200, wealth: 100 },
  properties: {
    dhaka:       { price: 450, buildCost: 200, rent: [55, 225, 650, 1500, 1800, 2200] },
    gazipur:     { price: 320, buildCost: 200, rent: [28, 150, 450, 1000, 1200, 1400] },
    rangpur:     { price: 140, buildCost: 50,  rent: [10, 50, 150, 450, 625, 750] },
    dinajpur:    { price: 100, buildCost: 50,  rent: [6, 30, 90, 270, 400, 550] },
    panchagarh:  { price: 80,  buildCost: 50,  rent: [4, 20, 60, 180, 320, 450] },
    rajshahi:    { price: 240, buildCost: 100, rent: [20, 100, 300, 750, 925, 1100] },
    natore:      { price: 120, buildCost: 100, rent: [8, 40, 100, 300, 450, 600] },
    pabna:       { price: 160, buildCost: 100, rent: [12, 60, 180, 500, 700, 900] },
    khulna:      { price: 260, buildCost: 100, rent: [22, 110, 330, 800, 975, 1150] },
    jashore:     { price: 200, buildCost: 100, rent: [16, 80, 220, 600, 800, 1000] },
    sundarbans:  { price: 180, buildCost: 100, rent: [14, 70, 200, 550, 750, 950] },
    mymensingh:  { price: 220, buildCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
    moulvibazar: { price: 180, buildCost: 150, rent: [14, 70, 200, 550, 750, 950] },
    sylhet:      { price: 300, buildCost: 150, rent: [26, 130, 390, 900, 1100, 1275] },
    cumilla:     { price: 220, buildCost: 100, rent: [18, 90, 250, 700, 875, 1050] },
    brahmanbaria:{ price: 160, buildCost: 100, rent: [12, 60, 180, 500, 700, 900] },
    feni:        { price: 140, buildCost: 100, rent: [10, 50, 150, 450, 625, 750] },
    saintMartin: { price: 280, buildCost: 150, rent: [24, 120, 360, 850, 1025, 1200] },
    bandarban:   { price: 240, buildCost: 150, rent: [20, 100, 300, 750, 925, 1100] },
    coxsBazar:   { price: 350, buildCost: 150, rent: [35, 175, 500, 1100, 1300, 1500] },
    chittagong:  { price: 400, buildCost: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
    sitakunda:   { price: 280, buildCost: 200, rent: [24, 120, 360, 850, 1025, 1200] },
  },
} satisfies {
  startingCash: { default: number; min: number; max: number };
  goSalary: number;
  bail: number;
  airportPrice: number;
  airportRent: readonly [number, number, number, number];
  utilityPrice: number;
  taxes: { income: number; wealth: number };
  properties: Record<string, StreetValues>;
};
