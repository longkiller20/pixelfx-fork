// Made by tools/hieu-ung.mjs: the effects the game uses, by id. Don't edit; run `node tools/hieu-ung.mjs`.

import * as arcane_arcane_beam from "./arcane/arcane-beam.js";
import * as arcane_arcane_missiles from "./arcane/arcane-missiles.js";
import * as arcane_arcane_orb from "./arcane/arcane-orb.js";
import * as arcane_blink_in from "./arcane/blink-in.js";
import * as arcane_blink_out from "./arcane/blink-out.js";
import * as arcane_magic_circle_cast from "./arcane/magic-circle-cast.js";
import * as arcane_mana_burst from "./arcane/mana-burst.js";
import * as arcane_portal from "./arcane/portal.js";
import * as arcane_rune_circle from "./arcane/rune-circle.js";
import * as arcane_spell_charge from "./arcane/spell-charge.js";
import * as arcane_star_fall from "./arcane/star-fall.js";
import * as arcane_time_stop from "./arcane/time-stop.js";
import * as critters_bat from "./critters/bat.js";
import * as critters_bird from "./critters/bird.js";
import * as critters_butterfly from "./critters/butterfly.js";
import * as critters_eyeball from "./critters/eyeball.js";
import * as critters_fish_school from "./critters/fish-school.js";
import * as critters_flying_skull from "./critters/flying-skull.js";
import * as critters_frog from "./critters/frog.js";
import * as critters_ghost from "./critters/ghost.js";
import * as critters_jellyfish from "./critters/jellyfish.js";
import * as critters_slime from "./critters/slime.js";
import * as critters_snake from "./critters/snake.js";
import * as critters_wisp from "./critters/wisp.js";
import * as explosions_big_explosion from "./explosions/big-explosion.js";
import * as explosions_dirt_explosion from "./explosions/dirt-explosion.js";
import * as explosions_implosion from "./explosions/implosion.js";
import * as explosions_plasma_explosion from "./explosions/plasma-explosion.js";
import * as explosions_small_explosion from "./explosions/small-explosion.js";
import * as explosions_smoke_bomb from "./explosions/smoke-bomb.js";
import * as fire_brazier from "./fire/brazier.js";
import * as fire_fire_breath from "./fire/fire-breath.js";
import * as fire_fire_ring from "./fire/fire-ring.js";
import * as fire_fire_tornado from "./fire/fire-tornado.js";
import * as fire_fireball from "./fire/fireball.js";
import * as fire_flame_pillar from "./fire/flame-pillar.js";
import * as fire_flamethrower from "./fire/flamethrower.js";
import * as fire_meteor from "./fire/meteor.js";
import * as fire_spirit_flame from "./fire/spirit-flame.js";
import * as holy_blessing from "./holy/blessing.js";
import * as holy_divine_shield from "./holy/divine-shield.js";
import * as holy_halo from "./holy/halo.js";
import * as holy_heal from "./holy/heal.js";
import * as holy_heal_aoe from "./holy/heal-aoe.js";
import * as holy_holy_pillar from "./holy/holy-pillar.js";
import * as holy_resurrection from "./holy/resurrection.js";
import * as holy_smite from "./holy/smite.js";
import * as holy_sunburst from "./holy/sunburst.js";
import * as ice_blizzard_vortex from "./ice/blizzard-vortex.js";
import * as ice_freeze from "./ice/freeze.js";
import * as ice_frost_breath from "./ice/frost-breath.js";
import * as ice_frost_nova from "./ice/frost-nova.js";
import * as ice_ice_crystal from "./ice/ice-crystal.js";
import * as ice_ice_lance from "./ice/ice-lance.js";
import * as ice_ice_shatter from "./ice/ice-shatter.js";
import * as ice_ice_spikes from "./ice/ice-spikes.js";
import * as ice_icicle_fall from "./ice/icicle-fall.js";
import * as ice_snowflake_burst from "./ice/snowflake-burst.js";
import * as impacts_ground_slam from "./impacts/ground-slam.js";
import * as impacts_heavy_landing from "./impacts/heavy-landing.js";
import * as impacts_hit_spark from "./impacts/hit-spark.js";
import * as impacts_parry from "./impacts/parry.js";
import * as impacts_shield_block from "./impacts/shield-block.js";
import * as lightning_ball_lightning from "./lightning/ball-lightning.js";
import * as lightning_chain_lightning from "./lightning/chain-lightning.js";
import * as lightning_charge_up from "./lightning/charge-up.js";
import * as lightning_electrified from "./lightning/electrified.js";
import * as lightning_lightning_strike from "./lightning/lightning-strike.js";
import * as lightning_storm_cloud from "./lightning/storm-cloud.js";
import * as lightning_thunderclap from "./lightning/thunderclap.js";
import * as lightning_zap_hit from "./lightning/zap-hit.js";
import * as melee_claw_swipe from "./melee/claw-swipe.js";
import * as melee_dagger_flurry from "./melee/dagger-flurry.js";
import * as melee_double_slash from "./melee/double-slash.js";
import * as melee_hammer_smash from "./melee/hammer-smash.js";
import * as melee_heavy_cleave from "./melee/heavy-cleave.js";
import * as melee_scythe_reap from "./melee/scythe-reap.js";
import * as melee_spear_sweep from "./melee/spear-sweep.js";
import * as melee_spin_slash from "./melee/spin-slash.js";
import * as melee_sword_slash from "./melee/sword-slash.js";
import * as melee_thrust from "./melee/thrust.js";
import * as melee_uppercut from "./melee/uppercut.js";
import * as melee_whip_crack from "./melee/whip-crack.js";
import * as nature_acid_splash from "./nature/acid-splash.js";
import * as nature_boulder from "./nature/boulder.js";
import * as nature_earth_spike from "./nature/earth-spike.js";
import * as nature_healing_bloom from "./nature/healing-bloom.js";
import * as nature_leaf_storm from "./nature/leaf-storm.js";
import * as nature_poison_cloud from "./nature/poison-cloud.js";
import * as nature_quake from "./nature/quake.js";
import * as nature_root_snare from "./nature/root-snare.js";
import * as nature_spore_burst from "./nature/spore-burst.js";
import * as nature_thorns from "./nature/thorns.js";
import * as nature_tornado from "./nature/tornado.js";
import * as nature_toxic_puddle from "./nature/toxic-puddle.js";
import * as nature_vine_whip from "./nature/vine-whip.js";
import * as pickups_loot_beam from "./pickups/loot-beam.js";
import * as projectiles_arrow from "./projectiles/arrow.js";
import * as projectiles_energy_disc from "./projectiles/energy-disc.js";
import * as projectiles_laser_bolt from "./projectiles/laser-bolt.js";
import * as projectiles_magic_missile from "./projectiles/magic-missile.js";
import * as scifi_emp_blast from "./scifi/emp-blast.js";
import * as scifi_force_field from "./scifi/force-field.js";
import * as scifi_warp_in from "./scifi/warp-in.js";
import * as scifi_warp_out from "./scifi/warp-out.js";
import * as shadow_black_hole from "./shadow/black-hole.js";
import * as shadow_curse from "./shadow/curse.js";
import * as shadow_dark_explosion from "./shadow/dark-explosion.js";
import * as shadow_eclipse from "./shadow/eclipse.js";
import * as shadow_grasping_hands from "./shadow/grasping-hands.js";
import * as shadow_hex_sigil from "./shadow/hex-sigil.js";
import * as shadow_life_steal from "./shadow/life-steal.js";
import * as shadow_necro_skulls from "./shadow/necro-skulls.js";
import * as shadow_shadow_flames from "./shadow/shadow-flames.js";
import * as shadow_shadow_tendrils from "./shadow/shadow-tendrils.js";
import * as shadow_soul_drain from "./shadow/soul-drain.js";
import * as shadow_void_orb from "./shadow/void-orb.js";
import * as spawn_poof from "./spawn/poof.js";
import * as spawn_respawn_beam from "./spawn/respawn-beam.js";
import * as spawn_summon_rise from "./spawn/summon-rise.js";
import * as status_burning from "./status/burning.js";
import * as transitions_star_iris from "./transitions/star-iris.js";
import * as ui_level_up from "./ui/level-up.js";
import * as water_bubbles from "./water/bubbles.js";
import * as water_geyser from "./water/geyser.js";
import * as water_ripples from "./water/ripples.js";
import * as water_splash from "./water/splash.js";
import * as water_water_jet from "./water/water-jet.js";
import * as water_water_orb from "./water/water-orb.js";
import * as water_waterfall from "./water/waterfall.js";
import * as water_wave_crash from "./water/wave-crash.js";
import * as water_whirlpool from "./water/whirlpool.js";

export const effects = {
  "arcane/arcane-beam": arcane_arcane_beam,
  "arcane/arcane-missiles": arcane_arcane_missiles,
  "arcane/arcane-orb": arcane_arcane_orb,
  "arcane/blink-in": arcane_blink_in,
  "arcane/blink-out": arcane_blink_out,
  "arcane/magic-circle-cast": arcane_magic_circle_cast,
  "arcane/mana-burst": arcane_mana_burst,
  "arcane/portal": arcane_portal,
  "arcane/rune-circle": arcane_rune_circle,
  "arcane/spell-charge": arcane_spell_charge,
  "arcane/star-fall": arcane_star_fall,
  "arcane/time-stop": arcane_time_stop,
  "critters/bat": critters_bat,
  "critters/bird": critters_bird,
  "critters/butterfly": critters_butterfly,
  "critters/eyeball": critters_eyeball,
  "critters/fish-school": critters_fish_school,
  "critters/flying-skull": critters_flying_skull,
  "critters/frog": critters_frog,
  "critters/ghost": critters_ghost,
  "critters/jellyfish": critters_jellyfish,
  "critters/slime": critters_slime,
  "critters/snake": critters_snake,
  "critters/wisp": critters_wisp,
  "explosions/big-explosion": explosions_big_explosion,
  "explosions/dirt-explosion": explosions_dirt_explosion,
  "explosions/implosion": explosions_implosion,
  "explosions/plasma-explosion": explosions_plasma_explosion,
  "explosions/small-explosion": explosions_small_explosion,
  "explosions/smoke-bomb": explosions_smoke_bomb,
  "fire/brazier": fire_brazier,
  "fire/fire-breath": fire_fire_breath,
  "fire/fire-ring": fire_fire_ring,
  "fire/fire-tornado": fire_fire_tornado,
  "fire/fireball": fire_fireball,
  "fire/flame-pillar": fire_flame_pillar,
  "fire/flamethrower": fire_flamethrower,
  "fire/meteor": fire_meteor,
  "fire/spirit-flame": fire_spirit_flame,
  "holy/blessing": holy_blessing,
  "holy/divine-shield": holy_divine_shield,
  "holy/halo": holy_halo,
  "holy/heal": holy_heal,
  "holy/heal-aoe": holy_heal_aoe,
  "holy/holy-pillar": holy_holy_pillar,
  "holy/resurrection": holy_resurrection,
  "holy/smite": holy_smite,
  "holy/sunburst": holy_sunburst,
  "ice/blizzard-vortex": ice_blizzard_vortex,
  "ice/freeze": ice_freeze,
  "ice/frost-breath": ice_frost_breath,
  "ice/frost-nova": ice_frost_nova,
  "ice/ice-crystal": ice_ice_crystal,
  "ice/ice-lance": ice_ice_lance,
  "ice/ice-shatter": ice_ice_shatter,
  "ice/ice-spikes": ice_ice_spikes,
  "ice/icicle-fall": ice_icicle_fall,
  "ice/snowflake-burst": ice_snowflake_burst,
  "impacts/ground-slam": impacts_ground_slam,
  "impacts/heavy-landing": impacts_heavy_landing,
  "impacts/hit-spark": impacts_hit_spark,
  "impacts/parry": impacts_parry,
  "impacts/shield-block": impacts_shield_block,
  "lightning/ball-lightning": lightning_ball_lightning,
  "lightning/chain-lightning": lightning_chain_lightning,
  "lightning/charge-up": lightning_charge_up,
  "lightning/electrified": lightning_electrified,
  "lightning/lightning-strike": lightning_lightning_strike,
  "lightning/storm-cloud": lightning_storm_cloud,
  "lightning/thunderclap": lightning_thunderclap,
  "lightning/zap-hit": lightning_zap_hit,
  "melee/claw-swipe": melee_claw_swipe,
  "melee/dagger-flurry": melee_dagger_flurry,
  "melee/double-slash": melee_double_slash,
  "melee/hammer-smash": melee_hammer_smash,
  "melee/heavy-cleave": melee_heavy_cleave,
  "melee/scythe-reap": melee_scythe_reap,
  "melee/spear-sweep": melee_spear_sweep,
  "melee/spin-slash": melee_spin_slash,
  "melee/sword-slash": melee_sword_slash,
  "melee/thrust": melee_thrust,
  "melee/uppercut": melee_uppercut,
  "melee/whip-crack": melee_whip_crack,
  "nature/acid-splash": nature_acid_splash,
  "nature/boulder": nature_boulder,
  "nature/earth-spike": nature_earth_spike,
  "nature/healing-bloom": nature_healing_bloom,
  "nature/leaf-storm": nature_leaf_storm,
  "nature/poison-cloud": nature_poison_cloud,
  "nature/quake": nature_quake,
  "nature/root-snare": nature_root_snare,
  "nature/spore-burst": nature_spore_burst,
  "nature/thorns": nature_thorns,
  "nature/tornado": nature_tornado,
  "nature/toxic-puddle": nature_toxic_puddle,
  "nature/vine-whip": nature_vine_whip,
  "pickups/loot-beam": pickups_loot_beam,
  "projectiles/arrow": projectiles_arrow,
  "projectiles/energy-disc": projectiles_energy_disc,
  "projectiles/laser-bolt": projectiles_laser_bolt,
  "projectiles/magic-missile": projectiles_magic_missile,
  "scifi/emp-blast": scifi_emp_blast,
  "scifi/force-field": scifi_force_field,
  "scifi/warp-in": scifi_warp_in,
  "scifi/warp-out": scifi_warp_out,
  "shadow/black-hole": shadow_black_hole,
  "shadow/curse": shadow_curse,
  "shadow/dark-explosion": shadow_dark_explosion,
  "shadow/eclipse": shadow_eclipse,
  "shadow/grasping-hands": shadow_grasping_hands,
  "shadow/hex-sigil": shadow_hex_sigil,
  "shadow/life-steal": shadow_life_steal,
  "shadow/necro-skulls": shadow_necro_skulls,
  "shadow/shadow-flames": shadow_shadow_flames,
  "shadow/shadow-tendrils": shadow_shadow_tendrils,
  "shadow/soul-drain": shadow_soul_drain,
  "shadow/void-orb": shadow_void_orb,
  "spawn/poof": spawn_poof,
  "spawn/respawn-beam": spawn_respawn_beam,
  "spawn/summon-rise": spawn_summon_rise,
  "status/burning": status_burning,
  "transitions/star-iris": transitions_star_iris,
  "ui/level-up": ui_level_up,
  "water/bubbles": water_bubbles,
  "water/geyser": water_geyser,
  "water/ripples": water_ripples,
  "water/splash": water_splash,
  "water/water-jet": water_water_jet,
  "water/water-orb": water_water_orb,
  "water/waterfall": water_waterfall,
  "water/wave-crash": water_wave_crash,
  "water/whirlpool": water_whirlpool,
};
