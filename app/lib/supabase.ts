import { createClient } from '@supabase/supabase-js';

// 環境変数が読み込めない場合でもビルドが止まらないように、空文字をデフォルトにする
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);