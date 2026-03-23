-- Clarify Strumming 101 step 8 and add new step 9
BEGIN;

-- Shift steps 9-11 to temporary negative values
UPDATE lesson_steps
SET step_number = -step_number
WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
AND step_number >= 9;

-- Shift to final positions (+1)
UPDATE lesson_steps
SET step_number = -step_number + 1
WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
AND step_number < 0;

-- Update step 8 to be clearer
UPDATE lesson_steps
SET instruction = 'Adding Up Strums - The "And": Now let''s combine down and up! Count "1-and-2-and-3-and-4-and" out loud. Your hand moves constantly: DOWN(1)-up-DOWN(2)-up-DOWN(3)-up-DOWN(4)-up. Start by making ALL those motions, even if you miss the strings on the "ups". Just get the rhythm: down-up-down-up-down-up-down-up. Your hand bounces continuously!'
WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
AND step_number = 8;

-- Insert new step 9
INSERT INTO lesson_steps (lesson_id, step_number, instruction, visual_asset_url)
SELECT id, 9,
  'The Classic Pattern - D D U D U: Here''s THE most common strumming pattern! Count "1-2-&-3-&-4-&". Strum: DOWN(1)-DOWN(2)-UP(&)-DOWN(3)-UP(&)-DOWN(4)-UP(&). Say it out loud as you play: "DOWN-DOWN-up-DOWN-up-DOWN-up". Notice: beats 1,2,3,4 are always DOWN. The "&" (and) beats are always UP. Practice slowly until it feels natural!',
  null
FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern';

-- Mark migration as complete
INSERT INTO pgmigrations (name, run_on)
VALUES ('1731196000000_clarify-strumming-and', NOW());

COMMIT;

-- Show result
SELECT step_number, LEFT(instruction, 100) as instruction
FROM lesson_steps
WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
ORDER BY step_number;
