// ─── Enums ────────────────────────────────────────────────────────────────────

export type AccountType      = "google" | "manual";
export type LeagueRole       = "admin" | "player";
export type TournamentStatus = "upcoming" | "group_stage" | "knockout" | "finished";
export type MatchStage       = "group" | "r32" | "r16" | "qf" | "sf" | "3rd_place" | "final";
export type MatchStatus      = "scheduled" | "live" | "finished" | "void";
export type SlipStatus       = "open" | "locked" | "won" | "lost" | "void" | "cancelled";
export type BetStatus        = "open" | "won" | "lost" | "void" | "cancelled";
export type BetOutcome       = "home" | "draw" | "away";
export type WalletTxType     = "bet_stake" | "bet_payout" | "bet_refund" | "inactivity_fee" | "group_bonus" | "admin_adjust";

// ─── Specialbets ──────────────────────────────────────────────────────────────
export type SpecialMarketType    = "vm_vinnare" | "skyttekung" | "sverige_mal";
export type SpecialBetStatus     = "active" | "superseded" | "cancelled";
export type SpecialWalletTxType  = "special_stake" | "special_payout" | "special_refund" | "admin_adjust";

// Keep legacy alias
export type UserRole = LeagueRole;

// ─── Database row types ───────────────────────────────────────────────────────

export interface Profile {
  id:           string;
  display_name: string;
  account_type: AccountType;
  is_active:    boolean;
  created_at:   string;
  updated_at:   string;
}

export interface InviteWhitelist {
  id:         string;
  email:      string;
  invited_by: string | null;
  used_at:    string | null;
  created_at: string;
}

export interface Tournament {
  id:                    string;
  name:                  string;
  status:                TournamentStatus;
  special_bets_deadline: string | null;
  created_at:            string;
  updated_at:            string;
}

export interface Team {
  id:            string;
  tournament_id: string;
  name:          string;
  short_name:    string;
  flag_emoji:    string | null;
  group_letter:  string | null;
  created_at:    string;
}

export interface Match {
  id:            string;
  tournament_id: string;
  match_number:  number;
  stage:         MatchStage;
  group_letter:  string | null;
  home_team_id:  string | null;
  away_team_id:  string | null;
  scheduled_at:  string;
  status:        MatchStatus;
  home_score:    number | null;
  away_score:    number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  external_id:   string | null;
  created_at:    string;
  updated_at:    string;
}

export interface League {
  id:            string;
  name:          string;
  tournament_id: string;
  is_open:       boolean;
  created_at:    string;
  updated_at:    string;
}

export interface LeagueMember {
  id:             string;
  league_id:      string;
  user_id:        string;
  role:           LeagueRole;
  match_wallet:   number;
  special_wallet: number;
  is_active:      boolean;
  joined_at:      string;
}

export interface AuditLog {
  id:          string;
  actor_id:    string | null;
  action:      string;
  entity_type: string | null;
  entity_id:   string | null;
  metadata:    Record<string, unknown> | null;
  created_at:  string;
}

// ─── Join types (common query shapes) ────────────────────────────────────────

export interface MatchWithTeams extends Match {
  home_team: Team | null;
  away_team: Team | null;
}

export interface MatchOdds {
  id:         string;
  match_id:   string;
  home_odds:  number;
  draw_odds:  number;
  away_odds:  number;
  source:     "admin" | "api";
  set_by:     string | null;
  created_at: string;
  updated_at: string;
}

export interface BetSlip {
  id:               string;
  league_member_id: string;
  stake:            number;
  combined_odds:    number;
  potential_payout: number;
  status:           SlipStatus;
  placed_at:        string;
  locked_at:        string | null;
  settled_at:       string | null;
  // Void-adjusted odds used for payout/statistics. Null until settled.
  // Equals combined_odds when no selections were voided; lower when voids removed.
  final_odds:       number | null;
  created_at:       string;
  updated_at:       string;
}

export interface BetSlipSelection {
  id:            string;
  slip_id:       string;
  match_id:      string;
  outcome:       BetOutcome;
  odds_snapshot: number;
  status:        BetStatus;
  created_at:    string;
  updated_at:    string;
}

export interface MatchWalletTransaction {
  id:               string;
  league_member_id: string;
  amount:           number;
  type:             WalletTxType;
  slip_id:          string | null;
  fee_date:         string | null; // Swedish calendar date for inactivity_fee / group_bonus
  created_at:       string;
}

export interface SpecialMarket {
  id:                   string;
  tournament_id:        string;
  type:                 SpecialMarketType;
  label:                string;
  // For vm_vinnare/skyttekung: decimal odds > 1.0, set by admin.
  // null when not yet set.
  odds:                 number | null;
  // For sverige_mal: 4.0 (fixed). null for odds-based markets.
  fixed_payout_factor:  number | null;
  set_by:               string | null;
  created_at:           string;
  updated_at:           string;
}

export interface SpecialBet {
  id:               string;
  league_member_id: string;
  market_id:        string;
  version:          number;
  selection_text:   string;
  stake:            number;
  odds_snapshot:    number;
  potential_payout: number;
  status:           SpecialBetStatus;
  placed_at:        string;
  settled_at:       string | null;
  created_at:       string;
  updated_at:       string;
}

export interface SpecialWalletTransaction {
  id:               string;
  league_member_id: string;
  amount:           number;
  type:             SpecialWalletTxType;
  special_bet_id:   string | null;
  created_at:       string;
}

// ─── Join types (common query shapes) ────────────────────────────────────────

export interface LeagueMemberWithProfile extends LeagueMember {
  profile: Profile;
}

export interface MatchWithTeamsAndOdds extends MatchWithTeams {
  odds: MatchOdds | null;
}

export interface BetSlipWithSelections extends BetSlip {
  selections: BetSlipSelection[];
}

export interface BetSlipFull extends BetSlipWithSelections {
  member: Pick<LeagueMember, "user_id" | "league_id">;
}
