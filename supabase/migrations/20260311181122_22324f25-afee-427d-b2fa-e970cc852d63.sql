
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Projeto sem título',
  current_step text NOT NULL DEFAULT 'upload',
  completed_steps text[] NOT NULL DEFAULT '{}',
  video_storage_path text,
  transcription jsonb,
  upload_options jsonb DEFAULT '{"removeSilences":true,"removeBadTakes":false,"removeFillers":true}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own projects"
  ON public.projects FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
