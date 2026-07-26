
-- Create storage bucket for video uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);

-- Allow anonymous uploads (no auth in this app)
CREATE POLICY "Anyone can upload videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'videos');

-- Allow reading uploaded videos (for edge function download)
CREATE POLICY "Anyone can read videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'videos');

-- Allow deleting videos after transcription
CREATE POLICY "Anyone can delete videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'videos');
