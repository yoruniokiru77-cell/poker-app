import { createClient } from '@supabase/supabase-js';

// Supabaseの「API」設定画面からコピーした値を ' ' の中に直接貼り付けてください
const supabaseUrl = 'https://tjwgdmhrhmcimfrauows.supabase.co';
const supabaseAnonKey = 'sb_publishable_1EyOQpJUt_zBMjwnu9R_EQ_9wtwG6Lo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);