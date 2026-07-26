
-- Add custom_music column to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS custom_music jsonb DEFAULT '[]'::jsonb;

-- RLS policies for music uploads in videos bucket
-- Allow authenticated users to upload to music/{their_user_id}/ path
CREATE POLICY "Users can upload music files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'videos'
  AND (storage.foldername(name))[1] = 'music'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to read their own music files
CREATE POLICY "Users can read own music files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'videos'
  AND (storage.foldername(name))[1] = 'music'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to delete their own music files
CREATE POLICY "Users can delete own music files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'videos'
  AND (storage.foldername(name))[1] = 'music'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
