-- ============================================================
-- Migration — Flag emojis for manually added teams
-- ============================================================
-- Teams added via SQL after the initial seed were missing
-- flag_emoji values. This sets them explicitly.
-- ============================================================

update teams set flag_emoji = '🇧🇦' where short_name = 'BIH';
update teams set flag_emoji = '🇶🇦' where short_name = 'QAT';
update teams set flag_emoji = '🇭🇹' where short_name = 'HAI';
update teams set flag_emoji = '🏴󠁧󠁢󠁳󠁣󠁴󠁿' where short_name = 'SCO';
update teams set flag_emoji = '🇨🇼' where short_name = 'CUW';
update teams set flag_emoji = '🇨🇻' where short_name = 'CPV';
update teams set flag_emoji = '🇮🇶' where short_name = 'IRQ';
update teams set flag_emoji = '🇳🇴' where short_name = 'NOR';
update teams set flag_emoji = '🇩🇿' where short_name = 'ALG';
update teams set flag_emoji = '🇯🇴' where short_name = 'JOR';
update teams set flag_emoji = '🇨🇩' where short_name = 'COD';
update teams set flag_emoji = '🇺🇿' where short_name = 'UZB';
