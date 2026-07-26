
-- Remove permissive public policies on videos bucket
DROP POLICY IF EXISTS "Allow public reads from videos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to videos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from videos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete videos" ON storage.objects;

-- Authenticated users can manage only files inside their own folder ({user_id}/...)
CREATE POLICY "Users can read own videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Users can upload own videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Users can update own videos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = (auth.uid())::text)
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Users can delete own videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- Lock down app_settings: no client access. Only service_role (used by edge functions) can read/write.
DROP POLICY IF EXISTS "Allow all access to app_settings" ON public.app_settings;

REVOKE ALL ON public.app_settings FROM anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
