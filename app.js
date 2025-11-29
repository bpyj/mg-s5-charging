// ----------------------------------------------------
// SOC bands: [start, end, DC taper factor, AC loss factor]
// Mirrors latest Python version (with softer AC factors).
// ----------------------------------------------------
const bands = [
  [0, 10, 1.20, 1.10],
  [10, 40, 1.05, 1.10],
  [40, 60, 1.15, 1.10],
  [60, 80, 1.60, 1.10], // AC: mild losses
  [80, 90, 4.50, 1.15],
  [90, 100, 9.00, 1.25],
];

// simple preset $/kWh per provider (edit anytime)
const PROVIDER_PRICES = {
  CDG: 0.55,
  SP: 0.55,
  Volt: 0.55,
  TE: 0.58,
};

window.addEventListener("DOMContentLoaded", () => {
  const costToggle = document.getElementById("costToggle");
  const providerSel = document.getElementById("providerSelect");
  const priceInp = document.getElementById("pricePerKWh");

  // Expose cost UI to calculate()
  window.__COST_UI__ = {
    wantCost: costToggle,
    providerSel,
    priceInp,
  };

  // When provider changes, put a suggested price if we have one
  providerSel.addEventListener("change", () => {
    const p = PROVIDER_PRICES[providerSel.value];
    if (p !== undefined) {
      priceInp.value = p.toFixed(3);
    }
  });
});

function calculate() {
  const start = parseFloat(document.getElementById("startSOC").value);
  const end = parseFloat(document.getElementById("endSOC").value);
  const battery = parseFloat(document.getElementById("batteryKWh").value);
  const type = document
    .getElementById("chargerType")
    .value.toUpperCase();
  const power = parseFloat(document.getElementById("powerKW").value);

  const outEl = document.getElementById("output");

  if (
    isNaN(start) ||
    isNaN(end) ||
    isNaN(battery) ||
    isNaN(power) ||
    !(type === "AC" || type === "DC")
  ) {
    outEl.textContent =
      "Please enter valid numbers for SOC, battery size and charger power.";
    return;
  }

  if (!(start >= 0 && end <= 100 && end > start)) {
    outEl.textContent =
      "Start SOC must be ≥ 0, End SOC ≤ 100, and End > Start.";
    return;
  }

  let segments = [];

  // 1) Build segments per SOC band
  for (let b of bands) {
    const [bStart, bEnd, dcFactor, acFactor] = b;

    const overlap = Math.max(
      0,
      Math.min(end, bEnd) - Math.max(start, bStart)
    );
    if (overlap <= 0) continue;

    const energy = battery * (overlap / 100); // kWh

    // 2) MG S5 AC limit: 6.6 kW max from wall
    let effectivePower = power;
    if (type === "AC") {
      effectivePower = Math.min(power, 6.6);
    }

    const baseHours = energy / effectivePower;

    // 3) Taper / loss factors
    let factor;
    if (type === "AC") {
      factor = acFactor; // fixed AC band factor
    } else {
      // DC logic:
      if (power >= 120) {
        // HPC
        factor = dcFactor;
      } else {
        // slow DC taper
        if (bEnd <= 80) factor = 1.20;
        else if (bEnd <= 90) factor = 1.55;
        else factor = 2.35;
      }
    }

    const adjusted = baseHours * factor;

    segments.push({
      bStart,
      bEnd,
      overlap,
      energy,
      baseHours,
      factor,
      adjusted,
      effectivePower,
    });
  }

  if (!segments.length) {
    outEl.textContent =
      "SOC range does not overlap any bands. Check your Start/End SOC.";
    return;
  }

  // 4) Totals
  const totalEnergy = segments.reduce((s, x) => s + x.energy, 0);
  const totalHours = segments.reduce((s, x) => s + x.adjusted, 0);
  const totalMin = totalHours * 60;

  // 5) Build text output
  let out = "";

  out += "SOC Slice   | Energy (kWh) | Time (min)\n";
  out += "------------|--------------|----------\n";
  segments.forEach((s) => {
    const slice = `${s.bStart}-${s.bEnd}%`;
    const mins = s.adjusted * 60;
    out += `${slice.padEnd(11)} | ${s.energy
      .toFixed(2)
      .padStart(6)} kWh   | ${mins.toFixed(1).padStart(6)}\n`;
  });

  out += "\n------------------------\n";
  out += `Total Energy: ${totalEnergy.toFixed(2)} kWh\n`;
  out += `Total Time:   ${totalMin.toFixed(1)} minutes\n`;
  out += `              ${totalHours.toFixed(2)} hours\n`;

  // 6) Optional cost block
  const costUI = window.__COST_UI__;
  if (costUI && costUI.wantCost.checked) {
    const providerName =
      costUI.providerSel.value || "Custom / Other";
    const price = parseFloat(costUI.priceInp.value);

    if (!isNaN(price) && price >= 0) {
      const cost = totalEnergy * price;
      out += "\n------------------------\n";
      out += "COST ESTIMATE\n";
      out += `Provider:   ${providerName}\n`;
      out += `Price:      $${price.toFixed(3)} / kWh\n`;
      out += `Energy:     ${totalEnergy.toFixed(2)} kWh\n`;
      out += `Total Cost: $${cost.toFixed(2)}\n`;
    } else {
      out += "\n[Cost] Please enter a valid price ($/kWh).\n";
    }
  }

  outEl.textContent = out;
}
