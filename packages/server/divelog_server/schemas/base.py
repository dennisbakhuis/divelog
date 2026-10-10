from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    """Base of the API schemas.

    Responses always carry every field, defaults included, so the output JSON schema marks
    defaulted fields as required and the generated TypeScript types see them as present.
    """

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
