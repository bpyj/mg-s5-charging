// SOC Bands: (start, end, DC taper factor, AC loss factor)
const bands = [
  [0, 10,   1.20, 1.08],
  [10, 40,  1.05, 1.08],
  [40, 60,  1.15, 1.08],
  [60, 80,  1.60, 1.18],
  [80, 90,  4.50, 1.28],
  [90,100,  9.00, 1.60]
];


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
        factor = acFactor;
      } else { // DC
        if (power >= 120) {
          factor = dcFactor;
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

  document.getElementById("output").textContent = out;

}
