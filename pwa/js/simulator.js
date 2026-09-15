// vibesODB2 Client-Side Powertrain Drive Cycle Simulator

export class DriveCycleSimulator {
  constructor(profile = 'city') {
    this.profile = profile;
    this.startTime = Date.now();
    this.coolantTemp = 72.0; // Starts cool, warms up
    this.iat = 24.0;
    this.dpfSoot = 18.4;
    this.totalDistanceKm = 142580.0;
    this.currentGear = 'D1';
    this.speedKmh = 0.0;
    this.rpm = 800.0;
    this.boostBar = 0.0;
    this.throttlePct = 0.0;
    this.egt = 280.0;
    this.fuelRailBar = 320.0;
  }

  setProfile(profile) {
    this.profile = profile;
    this.startTime = Date.now();
  }

  tick() {
    const elapsed = (Date.now() - this.startTime) / 1000.0;

    // Thermal warmup towards equilibrium (90°C nominal coolant)
    if (this.coolantTemp < 90.0) {
      this.coolantTemp += 0.04;
    }

    if (this.profile === 'idle') {
      this.speedKmh = 0.0;
      this.rpm = 790.0 + Math.sin(elapsed * 2.0) * 15.0;
      this.boostBar = 0.02;
      this.throttlePct = 0.0;
      this.currentGear = 'P';
      this.egt = 190.0 + Math.sin(elapsed) * 10.0;
      this.fuelRailBar = 280.0 + Math.sin(elapsed) * 15.0;
    } else if (this.profile === 'highway') {
      // Steady cruising at ~115 km/h in 6th gear
      this.speedKmh = 114.0 + Math.sin(elapsed * 0.4) * 4.0;
      this.rpm = 2150.0 + (this.speedKmh - 114.0) * 20.0;
      this.boostBar = 0.42 + Math.sin(elapsed * 0.5) * 0.08;
      this.throttlePct = 28.0 + Math.sin(elapsed * 0.4) * 3.0;
      this.currentGear = 'D6';
      this.egt = 480.0 + Math.sin(elapsed * 0.3) * 25.0;
      this.fuelRailBar = 1100.0 + Math.sin(elapsed * 0.5) * 50.0;
      this.dpfSoot += 0.0005;
    } else if (this.profile === 'spirited') {
      // High-rpm aggressive pulls and hard gear shifts
      const cycle = elapsed % 24.0;
      if (cycle < 6.0) {
        // Hard pull in 2nd gear
        const frac = cycle / 6.0;
        this.speedKmh = 25.0 + frac * 45.0;
        this.rpm = 2200.0 + frac * 3200.0; // Reaches 5400 RPM redline!
        this.boostBar = 1.45 + Math.random() * 0.05;
        this.throttlePct = 100.0;
        this.currentGear = 'D2';
        this.egt = 680.0 + frac * 120.0; // Up to 800°C
        this.fuelRailBar = 1750.0;
      } else if (cycle < 7.0) {
        // Gear shift 2 -> 3
        this.rpm = 3100.0;
        this.boostBar = 0.8;
        this.throttlePct = 50.0;
        this.currentGear = 'D3';
      } else if (cycle < 15.0) {
        // Hard pull in 3rd gear
        const frac = (cycle - 7.0) / 8.0;
        this.speedKmh = 70.0 + frac * 50.0;
        this.rpm = 3100.0 + frac * 2100.0;
        this.boostBar = 1.42;
        this.throttlePct = 95.0;
        this.currentGear = 'D3';
        this.egt = 760.0 + frac * 60.0;
        this.fuelRailBar = 1780.0;
      } else if (cycle < 19.0) {
        // Lift off and braking
        const frac = (cycle - 15.0) / 4.0;
        this.speedKmh = Math.max(25.0, 120.0 - frac * 95.0);
        this.rpm = Math.max(1200.0, 5200.0 - frac * 4000.0);
        this.boostBar = 0.05;
        this.throttlePct = 0.0;
        this.currentGear = 'D2';
        this.egt = Math.max(450.0, 820.0 - frac * 350.0);
        this.fuelRailBar = 400.0;
      } else {
        // Recovery idle before next pull
        this.speedKmh = 20.0;
        this.rpm = 1100.0;
        this.boostBar = 0.1;
        this.throttlePct = 15.0;
        this.currentGear = 'D2';
      }
    } else {
      // 'city' Stop-and-go 36s cycle
      const cycle = elapsed % 36.0;
      if (cycle < 6.0) {
        // Standing start in 1st gear
        const frac = cycle / 6.0;
        this.speedKmh = frac * 22.0;
        this.rpm = 850.0 + frac * 1750.0;
        this.boostBar = 0.25 * frac;
        this.throttlePct = 35.0;
        this.currentGear = 'D1';
        this.egt = 310.0 + frac * 40.0;
        this.fuelRailBar = 600.0 + frac * 250.0;
      } else if (cycle < 16.0) {
        // Accelerating in 2nd/3rd gear
        const frac = (cycle - 6.0) / 10.0;
        this.speedKmh = 22.0 + frac * 28.0;
        this.rpm = 1800.0 + Math.sin(frac * Math.PI) * 800.0;
        this.boostBar = 0.45;
        this.throttlePct = 40.0;
        this.currentGear = frac > 0.4 ? 'D3' : 'D2';
        this.egt = 370.0 + frac * 50.0;
        this.fuelRailBar = 850.0 + frac * 150.0;
      } else if (cycle < 26.0) {
        // Urban 50 km/h cruising in 4th gear
        this.speedKmh = 50.0 + Math.sin(elapsed * 0.8) * 1.5;
        this.rpm = 1650.0 + Math.sin(elapsed * 0.8) * 40.0;
        this.boostBar = 0.18;
        this.throttlePct = 20.0;
        this.currentGear = 'D4';
        this.egt = 410.0;
        this.fuelRailBar = 680.0;
      } else {
        // Decelerating to red light / idle stop
        const frac = (cycle - 26.0) / 10.0;
        this.speedKmh = Math.max(0.0, 50.0 * (1.0 - frac * 1.2));
        this.rpm = Math.max(800.0, 1650.0 - frac * 850.0);
        this.boostBar = 0.02;
        this.throttlePct = 0.0;
        this.currentGear = this.speedKmh > 5.0 ? 'D2' : 'D1';
        this.egt = Math.max(260.0, 410.0 - frac * 140.0);
        this.fuelRailBar = 340.0;
      }
    }

    const mapKpa = 101.3 + this.boostBar * 100.0;

    return {
      timestamp: Date.now(),
      metrics: {
        vehicle_speed_kmh: Math.round(this.speedKmh),
        engine_rpm: Math.round(this.rpm),
        coolant_temp_c: Math.round(this.coolantTemp),
        intake_manifold_pressure_kpa: Math.round(mapKpa),
        boost_pressure_bar: Number(this.boostBar.toFixed(2)),
        throttle_position_pct: Math.round(this.throttlePct),
        intake_air_temp_c: Math.round(this.iat),
        fuel_rail_pressure_bar: Math.round(this.fuelRailBar),
        dpf_soot_mass_g: Number(this.dpfSoot.toFixed(1)),
        exhaust_gas_temp_c: Math.round(this.egt),
        engaged_gear: this.currentGear
      }
    };
  }
}
