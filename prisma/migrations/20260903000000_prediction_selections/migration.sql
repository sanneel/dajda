-- The legs of a bet, as the author typed them from the slip. The public
-- page renders a DAJDA ticket from these rows instead of showing the
-- bookmaker's screenshot, which carried the operator's branding and often
-- the author's balance. The screenshot stays with the author and the
-- administrator as the evidence the settlement is checked against.
CREATE TABLE "PredictionSelection" (
    "id" UUID NOT NULL,
    "predictionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "eventKa" TEXT NOT NULL,
    "pickKa" TEXT NOT NULL,
    "oddsMilli" INTEGER NOT NULL,

    CONSTRAINT "PredictionSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PredictionSelection_predictionId_position_key" ON "PredictionSelection"("predictionId", "position");

ALTER TABLE "PredictionSelection" ADD CONSTRAINT "PredictionSelection_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
