// SOC Bands: (start, end, DC taper factor, AC loss factor)
const bands = [
  [0, 10,   1.20, 1.08],
  [10, 40,  1.05, 1.08],
  [40, 60,  1.15, 1.08],
  [60, 80,  1.60, 1.80], // ← AC calibrated: 69→72% takes ~27 min @ 7.4 kW
  [80, 90,  4.50, 1.28],
  [90,100,  9.00, 1.60]
];

// ---- helper: adaptive AC factor based on power & SOC band ----
function acFactorForBand(acBase, bandHi, powerKw) {
  // For low SOC bands (<60%), just use base factor
  if (bandHi < 60) return acBase;

  // Target factors at low-power AC (~3.0 kW)
  const lowTargets = {
    80: 1.05, // 60–80%
    90: 1.20, // 80–90%
    100: 1.40 // 90–100%
  };
  const low = lowTargets[bandHi] ?? acBase;

  const lowPower = 3.0;
  const highPower = 7.4;

  // Clamp power into [3.0, 7.4]
  const p = Math.max(lowPower, Math.min(highPower, powerKw));

  // t = 0 at 3.0 kW, t = 1 at 7.4 kW
  const t = (p - lowPower) / (highPower - lowPower);

  // Blend between low factor and base factor
  return low * (1 - t) + acBase * t;
}

function calculate() {
  let start = parseFloat(document.getElementById("startSOC").value);
  let end = parseFloat(document.getElementById("endSOC").value);
  let battery = parseFloat(document.getElementById("batteryKWh").value);
  let type = document.getElementById("chargerType").value.toUpperCase();
  let power = parseFloat(document.getElementById("powerKW").value);

  let segments = [];

  for (let b of bands) {
    let [bStart, bEnd, dcFactor, acFactor] = b;
    let overlap = Math.max(0, Math.min(end, bEnd) - Math.max(start, bStart));
    if (overlap > 0) {
      let energy = battery * (overlap / 100);
      let baseHours = energy / power;

      let factor;
      if (type === "AC") {
        // use adaptive AC factor
        factor = acFactorForBand(acFactor, bEnd, power);
      } else { // DC
        if (power >= 120) {
          factor = dcFactor; // HPC: strong taper
        } else {
          // updated slow DC taper calibration
          if (bEnd <= 80) factor = 1.20;
          else if (bEnd <= 90) factor = 1.55;
          else factor = 2.35;
        }
      }

      let adjusted = baseHours * factor;
      segments.push({ bStart, bEnd, overlap, energy, baseHours, factor, adjusted });
    }
  }

  let totalEnergy = segments.reduce((s, x) => s + x.energy, 0);
  let totalHours = segments.reduce((s, x) => s + x.adjusted, 0);
  let totalMin = totalHours * 60;
  let totalHoursRounded = totalHours.toFixed(2);

  let out = "";
  out += "SOC Slice   | Energy (kWh) | Time (min)\n";
  out += "------------|--------------|----------\n";
  segments.forEach(s => {
    out += `${s.bStart}-${s.bEnd}%      | ${s.energy.toFixed(2)} kWh     | ${(s.adjusted*60).toFixed(1)}\n`;
  });

  out += "\n------------------------\n";
  out += `Total Energy: ${totalEnergy.toFixed(2)} kWh\n`;
  out += `Total Time:   ${totalMin.toFixed(1)} minutes\n`;
  out += `              ${totalHoursRounded} hours\n`;

  // ✅ OPTIONAL COST: read UI signals from index.html
  const costUI = window.__COST_UI__;
  if (costUI && costUI.wantCost.checked) {
    const providerName = costUI.providerSel.value || "Custom";
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

  document.getElementById("output").textContent = out;
}
