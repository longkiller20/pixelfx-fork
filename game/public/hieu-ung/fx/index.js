// Made by tools/hieu-ung.mjs: the effects the game uses, by id. Don't edit; run `node tools/hieu-ung.mjs`.

import * as arcane_arcane_orb from "./arcane/arcane-orb.js";
import * as arcane_blink_in from "./arcane/blink-in.js";
import * as arcane_blink_out from "./arcane/blink-out.js";
import * as arcane_mana_burst from "./arcane/mana-burst.js";
import * as arcane_portal from "./arcane/portal.js";
import * as arcane_rune_circle from "./arcane/rune-circle.js";
import * as arcane_teleport_array from "./arcane/teleport-array.js";
import * as chinhta_barrier from "./chinhta/barrier.js";
import * as chinhta_emblem from "./chinhta/emblem.js";
import * as chinhta_flag from "./chinhta/flag.js";
import * as chinhta_stele from "./chinhta/stele.js";
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
import * as explosions_firework_burst from "./explosions/firework-burst.js";
import * as explosions_firework_rocket from "./explosions/firework-rocket.js";
import * as explosions_nuke from "./explosions/nuke.js";
import * as farm_chicken from "./farm/chicken.js";
import * as farm_cow from "./farm/cow.js";
import * as farm_duck from "./farm/duck.js";
import * as farm_kim_ngan_hoa from "./farm/kim-ngan-hoa.js";
import * as farm_linh_chi from "./farm/linh-chi.js";
import * as farm_linh_thao from "./farm/linh-thao.js";
import * as farm_nhan_sam from "./farm/nhan-sam.js";
import * as farm_pig from "./farm/pig.js";
import * as farm_props from "./farm/props.js";
import * as fire_brazier from "./fire/brazier.js";
import * as fire_fire_tornado from "./fire/fire-tornado.js";
import * as fire_fireball from "./fire/fireball.js";
import * as fire_flame_pillar from "./fire/flame-pillar.js";
import * as fire_meteor from "./fire/meteor.js";
import * as fire_spirit_flame from "./fire/spirit-flame.js";
import * as fishing_bobber from "./fishing/bobber.js";
import * as fishing_button from "./fishing/button.js";
import * as fishing_catch from "./fishing/catch.js";
import * as fishing_fish from "./fishing/fish.js";
import * as fishing_gear from "./fishing/gear.js";
import * as fishing_props from "./fishing/props.js";
import * as fishing_stall from "./fishing/stall.js";
import * as holy_heal from "./holy/heal.js";
import * as home_furnace from "./home/furnace.js";
import * as home_furniture from "./home/furniture.js";
import * as home_gamer_house from "./home/gamer-house.js";
import * as home_lantern from "./home/lantern.js";
import * as home_tien_phu from "./home/tien-phu.js";
import * as impacts_ground_slam from "./impacts/ground-slam.js";
import * as impacts_hit_spark from "./impacts/hit-spark.js";
import * as lightning_charge_up from "./lightning/charge-up.js";
import * as lightning_lightning_strike from "./lightning/lightning-strike.js";
import * as love_banner_frame from "./love/banner-frame.js";
import * as love_heart_beat from "./love/heart-beat.js";
import * as love_heart_fall from "./love/heart-fall.js";
import * as love_hearts from "./love/hearts.js";
import * as love_ring from "./love/ring.js";
import * as love_rose from "./love/rose.js";
import * as love_wedding from "./love/wedding.js";
import * as melee_double_slash from "./melee/double-slash.js";
import * as melee_heavy_cleave from "./melee/heavy-cleave.js";
import * as melee_sword_slash from "./melee/sword-slash.js";
import * as nature_earth_spike from "./nature/earth-spike.js";
import * as nhanvat_kiem_khach from "./nhanvat/kiem-khach.js";
import * as nhanvat_tien_tu from "./nhanvat/tien-tu.js";
import * as pickups_loot_beam from "./pickups/loot-beam.js";
import * as projectiles_laser_bolt from "./projectiles/laser-bolt.js";
import * as shadow_dark_explosion from "./shadow/dark-explosion.js";
import * as shadow_necro_skulls from "./shadow/necro-skulls.js";
import * as shadow_shadow_flames from "./shadow/shadow-flames.js";
import * as shadow_void_orb from "./shadow/void-orb.js";
import * as spawn_poof from "./spawn/poof.js";
import * as spawn_respawn_beam from "./spawn/respawn-beam.js";
import * as status_burning from "./status/burning.js";
import * as status_rage from "./status/rage.js";
import * as transitions_star_iris from "./transitions/star-iris.js";
import * as ui_level_up from "./ui/level-up.js";
import * as ui_menu_icon from "./ui/menu-icon.js";
import * as water_bubbles from "./water/bubbles.js";
import * as water_ripples from "./water/ripples.js";
import * as water_splash from "./water/splash.js";
import * as water_water_orb from "./water/water-orb.js";
import * as water_waterfall from "./water/waterfall.js";

export const effects = {
  "arcane/arcane-orb": arcane_arcane_orb,
  "arcane/blink-in": arcane_blink_in,
  "arcane/blink-out": arcane_blink_out,
  "arcane/mana-burst": arcane_mana_burst,
  "arcane/portal": arcane_portal,
  "arcane/rune-circle": arcane_rune_circle,
  "arcane/teleport-array": arcane_teleport_array,
  "chinhta/barrier": chinhta_barrier,
  "chinhta/emblem": chinhta_emblem,
  "chinhta/flag": chinhta_flag,
  "chinhta/stele": chinhta_stele,
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
  "explosions/firework-burst": explosions_firework_burst,
  "explosions/firework-rocket": explosions_firework_rocket,
  "explosions/nuke": explosions_nuke,
  "farm/chicken": farm_chicken,
  "farm/cow": farm_cow,
  "farm/duck": farm_duck,
  "farm/kim-ngan-hoa": farm_kim_ngan_hoa,
  "farm/linh-chi": farm_linh_chi,
  "farm/linh-thao": farm_linh_thao,
  "farm/nhan-sam": farm_nhan_sam,
  "farm/pig": farm_pig,
  "farm/props": farm_props,
  "fire/brazier": fire_brazier,
  "fire/fire-tornado": fire_fire_tornado,
  "fire/fireball": fire_fireball,
  "fire/flame-pillar": fire_flame_pillar,
  "fire/meteor": fire_meteor,
  "fire/spirit-flame": fire_spirit_flame,
  "fishing/bobber": fishing_bobber,
  "fishing/button": fishing_button,
  "fishing/catch": fishing_catch,
  "fishing/fish": fishing_fish,
  "fishing/gear": fishing_gear,
  "fishing/props": fishing_props,
  "fishing/stall": fishing_stall,
  "holy/heal": holy_heal,
  "home/furnace": home_furnace,
  "home/furniture": home_furniture,
  "home/gamer-house": home_gamer_house,
  "home/lantern": home_lantern,
  "home/tien-phu": home_tien_phu,
  "impacts/ground-slam": impacts_ground_slam,
  "impacts/hit-spark": impacts_hit_spark,
  "lightning/charge-up": lightning_charge_up,
  "lightning/lightning-strike": lightning_lightning_strike,
  "love/banner-frame": love_banner_frame,
  "love/heart-beat": love_heart_beat,
  "love/heart-fall": love_heart_fall,
  "love/hearts": love_hearts,
  "love/ring": love_ring,
  "love/rose": love_rose,
  "love/wedding": love_wedding,
  "melee/double-slash": melee_double_slash,
  "melee/heavy-cleave": melee_heavy_cleave,
  "melee/sword-slash": melee_sword_slash,
  "nature/earth-spike": nature_earth_spike,
  "nhanvat/kiem-khach": nhanvat_kiem_khach,
  "nhanvat/tien-tu": nhanvat_tien_tu,
  "pickups/loot-beam": pickups_loot_beam,
  "projectiles/laser-bolt": projectiles_laser_bolt,
  "shadow/dark-explosion": shadow_dark_explosion,
  "shadow/necro-skulls": shadow_necro_skulls,
  "shadow/shadow-flames": shadow_shadow_flames,
  "shadow/void-orb": shadow_void_orb,
  "spawn/poof": spawn_poof,
  "spawn/respawn-beam": spawn_respawn_beam,
  "status/burning": status_burning,
  "status/rage": status_rage,
  "transitions/star-iris": transitions_star_iris,
  "ui/level-up": ui_level_up,
  "ui/menu-icon": ui_menu_icon,
  "water/bubbles": water_bubbles,
  "water/ripples": water_ripples,
  "water/splash": water_splash,
  "water/water-orb": water_water_orb,
  "water/waterfall": water_waterfall,
};
